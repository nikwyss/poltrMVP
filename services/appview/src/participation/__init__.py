"""
Participation module: ATProto-based argumentarium.

Provides background loops for crossposting and peer review.
"""

from src.participation.crosspost import start_crosspost_loop, stop_crosspost_loop
from src.participation.peer_review import start_peer_review_loop, stop_peer_review_loop


def start_participation_loops():
    start_crosspost_loop()
    start_peer_review_loop()


def stop_participation_loops():
    stop_peer_review_loop()
    stop_crosspost_loop()
