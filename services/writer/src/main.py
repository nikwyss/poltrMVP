"""Entrypoint for the internal write-side ("writer") process.

Phase 1 of the ATProto-native deliberation rework (see plan
typed-kindling-flask): governance write-back work moves off the internet-facing
appview API into a dedicated internal process. This first step runs the Bluesky
cross-post loop here, reusing src.atproto.crosspost unchanged.

Later phases add the acceptance pipeline (user-authored records → community
records), the translator, and the peer-review assignment to this same process.

Run:  python -m src.main
"""

import asyncio
import logging
import os
import signal
from pathlib import Path

from dotenv import load_dotenv

import src.shared.db as db
from src.atproto.acceptance import run_acceptance_forever
from src.atproto.crosspost import run_crosspost_forever
from src.translation.translator import run_translation_forever

load_dotenv(dotenv_path=Path(__file__).resolve().parent / "core" / ".env")

log_level = os.getenv("APPVIEW_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("writer")


async def _main():
    logger.info("=== Writer process starting (crosspost) ===")
    if not await db.check_db_connection():
        logger.warning("Database connection failed, but continuing...")

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:  # e.g. on platforms without signal support
            pass

    # Crosspost + translation both self-gate via their *_ENABLED env flags.
    tasks = [
        asyncio.create_task(run_crosspost_forever()),
        asyncio.create_task(run_translation_forever()),
    ]
    # Acceptance pipeline (Phase 3) — only when enabled; dormant otherwise so the
    # writer keeps doing just crossposts/translation on older DBs.
    if os.getenv("ACCEPTANCE_PIPELINE_ENABLED", "false").lower() == "true":
        logger.info("Acceptance pipeline enabled")
        tasks.append(asyncio.create_task(run_acceptance_forever()))

    await stop.wait()

    logger.info("=== Writer process shutting down ===")
    for task in tasks:
        task.cancel()
    for task in tasks:
        try:
            await task
        except asyncio.CancelledError:
            pass
    await db.close_pool()


def main():
    asyncio.run(_main())


if __name__ == "__main__":
    main()
