from src.core.fastapi import app

from src.routes.auth import router as auth_router
from src.routes.ballots import routers as ballot_routers
from src.routes.deliberation import routers as deliberation_routers
from src.routes.atproto import routers as atproto_routers

app.include_router(auth_router)

# Basis-App layer (REST, not ATProto): /api/ballots*
for router in ballot_routers:
    app.include_router(router)

# Deliberation layer (XRPC, ATProto-backed): arguments, comments, likes, activity, reviews
for router in deliberation_routers:
    app.include_router(router)

for router in atproto_routers:
    app.include_router(router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
