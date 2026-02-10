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
uvicorn main:app --reload --host 0.0.0.0 --port 3000
```

**Option B: VS Code Debugging**
1. Open the project in VS Code
2. Press `F5` or go to Run & Debug panel
3. Select "Python: FastAPI" configuration
4. Press the green play button

**Option C: Direct Python execution**
```bash
python main.py
```

The API will be available at: http://localhost:3000

## API Endpoints

- `GET /healthz` - Health check endpoint
- `GET /xrpc/app.ch.poltr.ballot.list` - List ballot entries with optional filters:
  - `did` (optional): Filter by DID
  - `since` (optional): Filter by date (ISO 8601)
  - `limit` (optional): Number of results (default: 50)

## Development

### VS Code Integration
The project includes VS Code configurations for:
- **Debugging**: Press F5 to start with debugger attached
- **Tasks**: Run tasks via Terminal > Run Task
  - Install Python dependencies
  - Run FastAPI dev server
  - Port-forward PostgreSQL

### Recommended VS Code Extensions
- Python (ms-python.python)
- Pylance (ms-python.vscode-pylance)
- Black Formatter (ms-python.black-formatter)
- Python Debugger (ms-python.debugpy)

## Dependencies

- **FastAPI**: Modern web framework (equivalent to Fastify)
- **asyncpg**: Async PostgreSQL driver
- **uvicorn**: ASGI server
- **python-dotenv**: Environment variable management

## Changelog

### 2025-01-29

**E-ID Verification Outsourced to eidproto**
- Removed `/xrpc/app.ch.poltr.user.verification.initiate` endpoint
- Removed `/xrpc/app.ch.poltr.user.verification.polling` endpoint
- Removed `pds_api_write_eid_proof_record_to_pds()` function
- Removed EID signing functions (`sign_eid_verification`, `get_signing_key`, `get_public_key_multibase`)
- Removed EID lexicon endpoint from `/.well-known/`
- Added `POST /auth/initiate-eid-verification` - creates secure session with eidproto service
- E-ID verification now handled entirely by `eidproto.poltr.info`
