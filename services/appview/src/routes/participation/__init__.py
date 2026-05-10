"""
Participation routes: ballots, arguments, comments, reviews, activity.
"""

from src.routes.participation.ballots import router as ballots_router
from src.routes.participation.reviews import router as reviews_router

# Re-export both routers for inclusion in main.py
routers = [ballots_router, reviews_router]
