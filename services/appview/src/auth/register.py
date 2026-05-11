"""
User registration: prepare credentials, provision PDS account, store in DB.
"""

import logging
import os
import random
import secrets
import string

from fastapi.responses import JSONResponse, RedirectResponse

import src.core.db as db
from src.auth.login import create_session_cookie
from src.auth.pseudonym_generator import generate_pseudonym
from src.config import MAX_PDS_ACCOUNTS
from src.participation.pds_creds import encrypt_app_password
from src.participation.provisioning import provision_pds_account, ProvisioningError

logger = logging.getLogger(__name__)


def _gen_handle() -> str:
    name = "user" + "".join(
        random.choices(string.ascii_lowercase + string.digits, k=6)
    )
    domain = os.getenv("PDS_PUBLIC_HANDLE")
    assert domain, "PDS_PUBLIC_HANDLE is not set (e.g. id.poltr.ch)"
    return f"{name}.{domain}"


def _gen_password() -> str:
    alphabet = string.ascii_letters + string.digits + string.punctuation
    return "".join(secrets.choice(alphabet) for _ in range(64))


async def create_account(user_email: str) -> JSONResponse | RedirectResponse:
    """Register a new user. Three phases:
    1. Prepare: generate handle, password, pseudonym
    2. PDS provisioning: create account, write profile, relay sync
    3. AppView registration: store credentials + pseudonym in DB, create session
    """
    if db.pool is None:
        await db.init_pool()

    # Enforce account limit
    if MAX_PDS_ACCOUNTS > 0:
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

    # Phase 1: Prepare
    handle = _gen_handle()
    password = _gen_password()
    ciphertext, nonce = encrypt_app_password(password)
    pseudonym = await generate_pseudonym()

    logger.debug(f"Registering {user_email}: handle={handle}, pseudonym={pseudonym['displayName']}")

    # Phase 2: PDS provisioning
    try:
        did, access_token = await provision_pds_account(handle, password, user_email, pseudonym)
    except ProvisioningError as e:
        return JSONResponse(
            status_code=e.status_code,
            content={"error": e.error_code, "message": e.message},
        )

    # Phase 3: AppView registration
    async with db.pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO auth_creds (did, handle, email, pds_url, app_pw_ciphertext, app_pw_nonce, pseudonym_template_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            """,
            did, handle, user_email, os.getenv("PDS_HOSTNAME"),
            ciphertext, nonce, pseudonym["templateId"],
        )
        await conn.execute(
            """
            INSERT INTO app_profiles (did, display_name, mountain_name, mountain_fullname, canton, height, color, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (did) DO NOTHING
            """,
            did, pseudonym["displayName"], pseudonym["mountainName"],
            pseudonym.get("mountainFullname") or pseudonym["mountainName"],
            pseudonym["canton"], pseudonym["height"], pseudonym["color"],
        )

    response = await create_session_cookie(
        did=did, handle=handle,
        display_name=pseudonym["displayName"],
    )

    logger.debug(f"Registration complete for {user_email}")
    return response
