"""
PDS account provisioning for new users.

Creates the ATProto identity: PDS account, profile, relay sync.
Called by register.py after Phase 1 (prepare) succeeds.
"""

import logging

from src.config import PROFILE_BIO_TEMPLATE
from src.participation.atproto_api import (
    TCreateAccountResponse,
    pds_admin_create_account,
    pds_admin_delete_account,
    pds_admin_toggle_handle,
    pds_put_record,
    relay_request_crawl,
    wait_for_plc_resolution,
    wait_for_relay_repo_indexed,
)

logger = logging.getLogger(__name__)


class ProvisioningError(Exception):
    """Raised when PDS provisioning fails."""
    def __init__(self, message: str, error_code: str = "pds_error", status_code: int = 502):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        super().__init__(message)


async def provision_pds_account(
    handle: str,
    password: str,
    email: str,
    pseudonym: dict,
) -> tuple[str, str]:
    """Provision a PDS account for a new user. Returns (did, access_token).

    Creates the account, writes the profile, syncs with the relay.
    On failure, cleans up the PDS account and raises ProvisioningError.
    """
    # Create PDS account
    try:
        user_session: TCreateAccountResponse = await pds_admin_create_account(
            handle, password, email
        )
    except RuntimeError as e:
        error_msg = str(e)
        logger.error(f"PDS account creation failed for {email}: {error_msg}")
        if "Email already taken" in error_msg:
            raise ProvisioningError("This email is already registered on the PDS", "email_taken", 409)
        if "Handle already taken" in error_msg:
            raise ProvisioningError("Generated handle conflict, please try again", "handle_taken", 409)
        raise ProvisioningError("Could not create account on PDS, please try again later")

    did = user_session.did
    logger.debug(f"PDS account created: {did}")

    try:
        await wait_for_plc_resolution(did)

        # Write profile to PDS
        bio_data = {
            **pseudonym,
            "mountainFullname": pseudonym.get("mountainFullname") or pseudonym["mountainName"],
        }
        bio = PROFILE_BIO_TEMPLATE.format(**bio_data)

        profile_result = await pds_put_record(
            user_session.accessJwt, did, "app.bsky.actor.profile", "self",
            {
                "$type": "app.bsky.actor.profile",
                "displayName": pseudonym["displayName"],
                "description": bio,
            },
        )
        profile_commit_rev = profile_result.get("commit", {}).get("rev")

        # Relay sync
        await relay_request_crawl()
        await wait_for_relay_repo_indexed(did, expected_rev=profile_commit_rev)
        await pds_admin_toggle_handle(did, handle)

        logger.debug(f"PDS provisioning complete for {did}")

    except Exception as e:
        logger.error(f"PDS provisioning failed for {email}: {e}")
        try:
            await pds_admin_delete_account(did)
        except Exception as delete_err:
            logger.error(f"Failed to delete orphan PDS account {did}: {delete_err}")
        raise ProvisioningError("Account creation failed, please try again", "registration_failed", 500)

    return did, user_session.accessJwt
