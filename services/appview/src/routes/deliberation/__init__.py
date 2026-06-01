"""
Deliberation routes — XRPC endpoints for ATProto records:
arguments, comments, likes, activity, peer reviews.

All endpoints under this package live in the ATProto-backed layer (records on
PDS, indexed via firehose into app_*). Ballot endpoints — which are CMS-backed
and *not* ATProto — live in src/routes/ballots/ instead.
"""

from src.routes.deliberation.arguments import router as arguments_router
from src.routes.deliberation.comments import router as comments_router
from src.routes.deliberation.likes import router as likes_router
from src.routes.deliberation.activity import router as activity_router
from src.routes.deliberation.reviews import router as reviews_router

routers = [
    arguments_router,
    comments_router,
    likes_router,
    activity_router,
    reviews_router,
]
