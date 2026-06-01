"""
Ballot routes — basis-app, CMS-backed, REST under /api/ballots*.

Argument/comment/like/activity/review routes have moved to
src/routes/deliberation/ to reflect the architecture split (see
doc/RECORD_TRANSLATIONS.md §5b-5).
"""

from src.routes.ballots.ballots import router as ballots_router

routers = [ballots_router]
