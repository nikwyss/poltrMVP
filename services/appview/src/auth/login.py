import logging
import secrets
import json
import os
from datetime import datetime, timedelta
from fastapi.responses import JSONResponse, RedirectResponse
import src.lib.db as db
from datetime import datetime, timezone
from src.lib.atproto_api import (
    TCreateAccountResponse,
    TLoginAccountResponse,
    pds_admin_create_account,
    pds_admin_delete_account,
    pds_admin_toggle_handle,
    pds_login,
    pds_put_record,
    relay_request_crawl,
    wait_for_plc_resolution,
    wait_for_relay_repo_indexed,
)
from src.auth.pseudonym_generator import generate_pseudonym
from src.config import MAX_PDS_ACCOUNTS, PROFILE_BIO_TEMPLATE
from src.lib.pds_creds import decrypt_app_password, encrypt_app_password

logger = logging.getLogger(__name__)


async def login_pds_account(user_email: str) -> JSONResponse:
    """Logs in an existing pds account (including auth login)"""
    if db.pool is None:
        logger.debug("Pool is None, initializing now...")
        await db.init_pool()
        logger.debug("Pool initialized successfully")

    logger.debug(f"Attempting to log in user with email: {user_email}")

    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT did, app_pw_ciphertext, app_pw_nonce
            FROM auth_creds
            WHERE email = $1
            """,
            user_email,
        )

        if not row:
            return JSONResponse(
                status_code=404,
                content={
                    "error": "user_not_found",
                    "message": "No account found for this email",
                },
            )

        # TODO PDS_LOCIN

        did = row["did"]
        nonce = row["app_pw_nonce"]
        ciphertext = row["app_pw_ciphertext"]
        password = decrypt_app_password(ciphertext, nonce)
        pds_user_session: TLoginAccountResponse = await pds_login(
            did=did,
            password=password,
        )

        response: JSONResponse = await create_session_cookie(
            user_session=pds_user_session
        )

        logger.debug(f"Login successful for {user_email}, session cookie created")
        response.content = (  # type: ignore
            {
                "success": True,
                "message": "Account created successfully",
            },
        )
        return response

    return JSONResponse(
        status_code=500, content={"error": "internal_error", "message": "Login failed"}
    )


async def create_account(user_email: str) -> JSONResponse | RedirectResponse:
    """Creates a new pds account (including auth login)"""

    # Enforce account limit (relay throttles at 100 per PDS hostname)
    if MAX_PDS_ACCOUNTS > 0:
        if db.pool is None:
            await db.init_pool()
        async with db.pool.acquire() as conn:
            count = await conn.fetchval("SELECT COUNT(*) FROM auth_creds")
        if count >= MAX_PDS_ACCOUNTS:
            logger.warning(f"Account limit reached: {count}/{MAX_PDS_ACCOUNTS}")
            return JSONResponse(
                status_code=503,
                content={
                    "error": "account_limit_reached",
                    "message": f"Registration is temporarily closed (account limit: {MAX_PDS_ACCOUNTS})",
                },
            )

    # create account on PDS
    import random, string, secrets

    logger.debug("START CREATING ACCOUNT.....")

    def gen_handle():
        name = "user" + "".join(
            random.choices(string.ascii_lowercase + string.digits, k=6)
        )
        domain = os.getenv("PDS_PUBLIC_HANDLE")
        assert domain, "PDS_PUBLIC_HANDLE is not set (e.g. id.poltr.ch)"
        return f"{name}.{domain}"

    def gen_password():
        alphabet = string.ascii_letters + string.digits + string.punctuation
        return "".join(secrets.choice(alphabet) for _ in range(64))

    handle = gen_handle()
    password = gen_password()
    ciphertext, nonce = encrypt_app_password(password)

    logger.debug("........pw and handles generated, now creating PDS account")

    try:
        user_session: TCreateAccountResponse = await pds_admin_create_account(
            handle, password, user_email
        )
    except RuntimeError as e:
        error_msg = str(e)
        logger.error(f"PDS account creation failed for {user_email}: {error_msg}")
        # Map PDS errors to user-friendly messages
        if "Email already taken" in error_msg:
            return JSONResponse(
                status_code=409,
                content={
                    "error": "email_taken",
                    "message": "This email is already registered on the PDS",
                },
            )
        if "Handle already taken" in error_msg:
            return JSONResponse(
                status_code=409,
                content={
                    "error": "handle_taken",
                    "message": "Generated handle conflict, please try again",
                },
            )
        return JSONResponse(
            status_code=502,
            content={
                "error": "pds_error",
                "message": "Could not create account on PDS, please try again later",
            },
        )

    logger.debug("........PDS account created successfully")

    # Wait for the DID to be resolvable on PLC directory before proceeding.
    # The PDS emits an #identity event immediately on createAccount; if the
    # Bluesky relay forwards it before PLC propagation finishes, the AppView
    # creates a broken stub entry that can never be repaired.
    await wait_for_plc_resolution(user_session.did)

    # Write a minimal profile immediately so the Bluesky AppView can index
    # this account.  The full pseudonym-based profile overwrites this below.
    await pds_put_record(
        user_session.accessJwt,
        user_session.did,
        "app.bsky.actor.profile",
        "self",
        {"$type": "app.bsky.actor.profile", "displayName": "", "description": ""},
    )
    # Note: we don't track the rev from the minimal profile since the full
    # profile below will overwrite it with a newer commit.

    # Everything after this point must succeed, or we delete the PDS account.
    try:
        if db.pool is None:
            await db.init_pool()

        # Generate pseudonym (random Swiss mountain + letter + color)
        pseudonym = await generate_pseudonym()

        logger.debug(".......pseudonym generated, now writing to PDS and DB")

        # Write full profile (displayName + bio) to PDS
        bio_data = {
            **pseudonym,
            "mountainFullname": pseudonym.get("mountainFullname")
            or pseudonym["mountainName"],
        }
        bio = PROFILE_BIO_TEMPLATE.format(**bio_data)

        profile_result = await pds_put_record(
            user_session.accessJwt,
            user_session.did,
            "app.bsky.actor.profile",
            "self",
            {
                "$type": "app.bsky.actor.profile",
                "displayName": pseudonym["displayName"],
                "description": bio,
                # TODO: later: add avatar (blob) and banner
            },
        )
        # Extract the commit rev so we can verify the relay has this exact
        # commit before firing the handle toggle identity event.
        profile_commit_rev = profile_result.get("commit", {}).get("rev")

        logger.debug(f"........profile set (commit rev: {profile_commit_rev}), now writing pseudonym record to PDS")

        # Write pseudonym record to PDS
        # pseudonym_record = {
        #     "$type": "app.ch.poltr.actor.pseudonym",
        #     "displayName": pseudonym["displayName"],
        #     "mountainName": pseudonym["mountainName"],
        #     "canton": pseudonym["canton"],
        #     "height": pseudonym["height"],
        #     "color": pseudonym["color"],
        #     "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        # }
        # if pseudonym.get("mountainFullname"):
        #     pseudonym_record["mountainFullname"] = pseudonym["mountainFullname"]

        # logger.debug(f"Pseudonym record payload: {pseudonym_record}")

        # await pds_put_record(
        #     user_session.accessJwt,
        #     user_session.did,
        #     "app.ch.poltr.actor.pseudonym",
        #     "self",
        #     pseudonym_record,
        # )

        # Ask relay to crawl our PDS so the new profile is visible on Bluesky
        await relay_request_crawl()

        # Wait until the Bluesky relay has indexed the repo commit that
        # contains the profile record.  The AppView creates permanent broken
        # stub entries when it processes an #identity event before the repo
        # data is available on the relay.  By passing the expected commit rev
        # we ensure the relay has the EXACT commit with the profile — not just
        # an older commit from account creation.
        await wait_for_relay_repo_indexed(user_session.did, expected_rev=profile_commit_rev)

        # Toggle handle to force a second #identity event on the firehose.
        # Because the relay already has the repo commit at this point, the
        # AppView will successfully index the account with the profile record.
        await pds_admin_toggle_handle(user_session.did, handle)

        logger.debug(
            "........pseudonym record written, now storing creds in DB and creating session cookie"
        )

        # Store encrypted password in auth_creds
        async with db.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO auth_creds (did, handle, email, pds_url, app_pw_ciphertext, app_pw_nonce, pseudonym_template_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                user_session.did,
                handle,
                user_email,
                os.getenv("PDS_HOSTNAME"),
                ciphertext,
                nonce,
                pseudonym["templateId"],
            )

        logger.debug("........creds stored in DB, now creating session cookie")

        response: JSONResponse = await create_session_cookie(
            user_session=user_session, display_name=pseudonym["displayName"]
        )

        logger.debug("........session cookie created, now returning response")

        response.content = (  # type: ignore
            {
                "success": True,
                "message": "Account created successfully",
            },
        )
        return response

    except Exception as e:
        # Compensating action: delete the PDS account we just created
        logger.error(
            f"Registration failed after PDS account creation: {e}. Delete orphan account again."
        )
        try:
            await pds_admin_delete_account(user_session.did)
        except Exception as delete_err:
            logger.error(
                f"Failed to delete orphan PDS account {user_session.did}: {delete_err}"
            )
        return JSONResponse(
            status_code=500,
            content={
                "error": "registration_failed",
                "message": "Account creation failed, please try again",
            },
        )


async def create_session_cookie(
    user_session: TCreateAccountResponse | TLoginAccountResponse,
    display_name: str | None = None,
) -> JSONResponse:
    """Helper to set session cookie on response"""

    session_token = secrets.token_urlsafe(48)
    session_expires = datetime.utcnow() + timedelta(days=7)

    # # create session like verify_magic_link_handler does
    user_data = {
        "did": user_session.did,
        "handle": user_session.handle,
        "displayName": display_name or user_session.handle.split(".")[0],
    }

    # Store session in database
    async with db.pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO auth_sessions (session_token, did, user_data, expires_at, access_token, refresh_token)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            session_token,
            user_session.did,
            json.dumps(user_data),
            session_expires,
            user_session.accessJwt,
            user_session.refreshJwt,
        )

    # # Return response with httpOnly cookie
    response = JSONResponse(
        status_code=200,
        content={
            "success": True,
            "user": user_data,  # Full user object with did, handle, displayName
            "session_token": session_token,  # Also return in body for localStorage fallback
            "expires_at": session_expires.isoformat(),
        },
    )

    # # Set secure httpOnly cookie
    is_production = os.getenv("ENVIRONMENT", "development") == "production"
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=is_production,  # Only send over HTTPS in production
        samesite="lax",
        max_age=7 * 24 * 60 * 60,  # 7 days in seconds
        path="/",
    )

    return response


async def check_email_availability(email: str) -> bool:
    """
    Check if a handle/email is not used in the auth_creds table.
    True means available, False means taken.
    """
    if db.pool is None:
        await db.init_pool()

    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT email
            FROM auth_creds
            WHERE email = $1
            """,
            email,
        )

        if row:
            return False
        else:
            return True
