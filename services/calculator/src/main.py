from src.core.fastapi import app

from src.tags.router import router as tags_router
from src.opencoding.router import router as opencoding_router
from src.topdown.router import router as topdown_router

# Axiale Taxonomie-Induktion (REST): /api/tags/induce-batch
app.include_router(tags_router)

# Open-Coding-Worker (Cron-getrieben): /opencoding, /opencoding/status
app.include_router(opencoding_router)

# Top-down Themen-Hierarchie (Prototyp): /api/topdown/induce
app.include_router(topdown_router)


if __name__ == "__main__":
    import uvicorn

    from src import config

    uvicorn.run(app, host="0.0.0.0", port=config.PORT)
