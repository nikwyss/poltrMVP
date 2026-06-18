# POLTR APPVIEW - Python Version

## Setup

### Install dependencies

Using pip directly:
```bash
pip install -r requirements.txt
```

Or with a virtual environment (recommended):
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Setup Postgres

```
psql -U <superuser> -d appview -f infra/scripts/postgres/db-setup.sql
```

### Environment Configuration
Copy `.env.dist` to `.env` and configure your database connection:
```bash
cp .env.dist .env
# Edit .env with your APPVIEW_POSTGRES_URL
```

## Running

### 1. Port-Forward PostgreSQL
```bash
kubectl port-forward -n poltr deployment/allforone-postgres 5432:5432
```

### 2. Launch Application

**Option A: Command line (development mode with auto-reload)**
```bash
uvicorn src.main:app --reload --host 0.0.0.0 --port 3000
```

**Option B: VS Code Debugging**
1. Open the project in VS Code
2. Press `F5` or go to Run & Debug panel
3. Select "Python: FastAPI" configuration
4. Press the green play button

The API will be available at: http://localhost:3000

(Production runs the same command via the Dockerfile: `uvicorn src.main:app --host 0.0.0.0 --port 3000`.)

## API Endpoints

XRPC endpoints are organised under `src/routes/` (`participation/`, `deliberation/`, `auth/`).
Browse the full, live API via the auto-generated OpenAPI docs at `http://localhost:3000/docs`
when the service is running.

- `GET /healthz` — Health check
