from src.lib.fastapi import app

# Well-known routes
from src.wellknown import *

# XRPC Routes - order matters! Specific routes before generic fallback
from src.routes.auth import router as auth_router
from src.routes.actor import router as actor_router
from src.routes.feed import router as feed_router
from src.routes.ozone import router as ozone_router
from src.routes.poltr import router as poltr_router
from src.routes.review import router as review_router
from src.routes.bluesky import router as generic_router

# Include routers in order (specific first, fallback last)
app.include_router(auth_router)
app.include_router(actor_router)
app.include_router(feed_router)
app.include_router(ozone_router)
app.include_router(poltr_router)
app.include_router(review_router)
app.include_router(generic_router)  # Fallback - must be last!


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
