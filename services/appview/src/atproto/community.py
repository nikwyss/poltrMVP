"""
Per-ballot community account lookups (read-only).

Each ballot has its own community account on the PDS. The appview is a
writer-first untrusted client: it no longer writes to community repos or holds
community credentials — the community-writer service
(services/community-writer) owns all community writes, session management, and
account creation. The appview only needs to resolve a ballot to its community
DID (e.g. to address the user's self-signed argument at the right repo).
"""

from src.core import db


async def get_did_for_ballot(ballot_rkey: str) -> str | None:
    """Look up the community DID for a ballot rkey."""
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            "SELECT did FROM auth.community_accounts WHERE ballot_rkey = $1",
            ballot_rkey,
        )
