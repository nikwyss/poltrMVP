from src.lib.fastapi import app
from src.proposals.routes import *
from src.auth.routes import *
from src.eid.routes import *
from services.appview.src.wellknown import *


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
