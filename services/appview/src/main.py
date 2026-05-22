from src.core.fastapi import app

from src.routes.auth import router as auth_router
from src.routes.ballots import routers as participation_routers
from src.routes.atproto import routers as atproto_routers

app.include_router(auth_router)

for router in participation_routers:
    app.include_router(router)

for router in atproto_routers:
    app.include_router(router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
