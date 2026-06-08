from src.core.fastapi import app

from src.topdown.router import router as topdown_router

# Top-down Themen-Hierarchie: /api/topdown/*
app.include_router(topdown_router)


if __name__ == "__main__":
    import uvicorn

    from src import config

    uvicorn.run(app, host="0.0.0.0", port=config.PORT)
