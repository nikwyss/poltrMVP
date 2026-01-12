from fastapi import Query, Request, Depends
from src.proposals.proposals import get_proposals_handler
from src.auth.middleware import TSession, verify_session_token
from src.lib.fastapi import app


@app.get("/xrpc/app.ch.poltr.vote.listProposals")
async def list_proposals(
    request: Request,
    since: str = Query(None),
    limit: int = Query(50),
    session: TSession = Depends(verify_session_token),
):
    return await get_proposals_handler(session=session, since=since, limit=limit)
