"""
ATProto/Bluesky routes: actor profiles, feed generator, ozone moderation, DID document.
"""

from src.routes.atproto.actor import router as actor_router
from src.routes.atproto.feed import router as feed_router
from src.routes.atproto.ozone import router as ozone_router
from src.routes.atproto.wellknown import router as wellknown_router

routers = [actor_router, feed_router, ozone_router, wellknown_router]
