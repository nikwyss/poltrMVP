from src.core.fastapi import app

from src.topdown.router import router as topdown_router
from src.embedding.router import router as embedding_router

# Top-down Themen-Hierarchie: /api/topdown/*
app.include_router(topdown_router)

# Embeddings (Dedup + semantische Suche): /api/embeddings/* — INTERN ONLY
# (nicht über den öffentlichen Ingress, siehe doc/CALCULATOR_EXPOSURE.md).
app.include_router(embedding_router)


if __name__ == "__main__":
    import uvicorn

    from src import config

    uvicorn.run(app, host="0.0.0.0", port=config.PORT)
