import secrets
import json
import os
from datetime import datetime, timedelta
from fastapi.responses import JSONResponse, RedirectResponse
import src.lib.db as db
from src.lib.atproto_api import (
    TCreateAccountResponse,
    TLoginAccountResponse,
    pds_api_admin_create_account,
    pds_api_login,
)
from src.lib.pds_creds import decrypt_app_password, encrypt_app_password


async def login_pds_account(user_email: str) -> JSONResponse:
    """Logs in an existing pds account (including auth login)"""
    if db.pool is None:
        print("Pool is None, initializing now...")
        await db.init_pool()
        print("Pool initialized successfully")

    print(f"Logging in user: {user_email}")

    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT did, app_pw_ciphertext, app_pw_nonce
            FROM pds_creds
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
        pds_user_session: TLoginAccountResponse = await pds_api_login(
            did=did,
            password=password,
        )

        response: JSONResponse = await create_session_cookie(
            user_session=pds_user_session
        )
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

    # create account on PDS
    import random, string, secrets

    def gen_handle():
        name = "user" + "".join(
            random.choices(string.ascii_lowercase + string.digits, k=6)
        )
        domain = os.getenv("PDS_DOMAIN_SHORT", "poltr.info")
        return f"{name}.{domain}"

    def gen_password():
        alphabet = string.ascii_letters + string.digits + string.punctuation
        return "".join(secrets.choice(alphabet) for _ in range(64))

    handle = gen_handle()
    password = gen_password()
    ciphertext, nonce = encrypt_app_password(password)

    user_session: TCreateAccountResponse = await pds_api_admin_create_account(
        handle, password, user_email
    )

    # Stroe encrypted password

    if db.pool is None:
        print("Pool is None, initializing now...")
        await db.init_pool()
        print("Pool initialized successfully")

    # store password in creds table
    async with db.pool.acquire() as conn:

        # Insert new entry in pds_creds table
        await conn.execute(
            """
            INSERT INTO pds_creds (did, handle, email, pds_url, app_pw_ciphertext, app_pw_nonce)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            user_session.did,
            handle,
            user_email,
            os.getenv("PDS_HOSTNAME"),
            ciphertext,
            nonce,
        )

    response: JSONResponse = await create_session_cookie(user_session=user_session)

    response.content = (  # type: ignore
        {
            "success": True,
            "message": "Account created successfully",
        },
    )
    return response


async def create_session_cookie(
    user_session: TCreateAccountResponse | TLoginAccountResponse,
) -> JSONResponse:
    """Helper to set session cookie on response"""

    session_token = secrets.token_urlsafe(48)
    session_expires = datetime.utcnow() + timedelta(days=7)

    # # create session like verify_magic_link_handler does
    user_data = {
        "did": user_session.did,
        "handle": user_session.handle,
        "displayName": user_session.handle.split(".")[0],
    }

    # Store session in database
    async with db.pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO sessions (session_token, did, user_data, expires_at, access_token, refresh_token)
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
    Check if a handle/email is not used in the pds_creds table.
    True means available, False means taken.
    """
    if db.pool is None:
        await db.init_pool()

    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT email
            FROM pds_creds
            WHERE email = $1
            """,
            email,
        )

        if row:
            return False
        else:
            return True
