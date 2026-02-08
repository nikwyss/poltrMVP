# Poltr.ch Frontend

A modern React + TypeScript frontend client for [poltr.info](https://poltr.info) with AT Protocol OAuth authentication.

## Features

- 🔐 **Browser-based OAuth** - Secure authentication using `@atproto/oauth-client-browser`
- 🌐 **AT Protocol Support** - Works with Poltr, Bluesky and any ATProto server
- ⚡ **Vite + React** - Fast development with hot module replacement
- 🔒 **PKCE Flow** - Public client OAuth with Proof Key for Code Exchange
- 💾 **IndexedDB Storage** - Secure token management in the browser
- 🎨 **TypeScript** - Full type safety


## OAuth Implementation

This app uses a **public OAuth client** (browser-based) which:
- Uses PKCE (Proof Key for Code Exchange) for security
- Stores tokens securely in IndexedDB
- Supports DPoP (Demonstrating Proof of Possession) tokens
- Works with loopback addresses for development (`127.0.0.1`)
- No server-side secrets required


## Local Development

### Prerequisites
- Node.js 20+ 
- npm

### Install and Run

```bash
# Install dependencies
npm install

# Start development server
npm start
```

The app will be available at `http://127.0.0.1:5173`

**Important:** Access the app using `127.0.0.1` (not `localhost`) for OAuth to work correctly with Bluesky's loopback client requirements.

### Other Commands

```bash
# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## Docker Deployment

### Build and Run Locally

```bash
# Build the Docker image
docker build -t poltr-front .

# Run the container
docker run -d -p 3000:80 poltr-front
```

Access the app at `http://localhost:3000`

### Push to Docker Hub

```bash
# Login to Docker Hub
docker login

# Tag the image
docker tag poltr-front nikwyss/poltr-front:latest

# Push to registry
docker push nikwyss/poltr-front:latest
```

### Pull and Run from Docker Hub

```bash
# Pull the latest image
docker pull nikwyss/poltr-front:latest

# Run the container
docker run -d -p 3000:80 nikwyss/poltr-front:latest
```

### Using Docker Compose

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down
```

## Production Deployment

For production deployment with a real domain:

1. **Configure Environment Variables**
   
   Create a `.env.production.local` file or set build arguments:
   ```bash
   VITE_REDIRECT_URI=https://poltr.ch/callback
   VITE_CLIENT_ID_BASE=https://poltr.ch
   ```

2. **Build with Docker (using build args)**
   ```bash
   docker build \
     --build-arg VITE_REDIRECT_URI=https://poltr.ch/callback \
     --build-arg VITE_CLIENT_ID_BASE=https://poltr.ch \
     -t poltr-front .
   ```

3. **Or build locally with env file**
   ```bash
   # Uses .env.production automatically
   npm run build
   ```

4. **Deploy**
   - The Docker image uses Nginx for production-grade serving
   - Supports SPA routing (all routes redirect to React Router)
   - Includes asset caching and security headers

**Note:** Never hardcode URLs in source files - always use environment variables for different deployment environments.

## Project Structure

```
src/
├── app/
│   ├── page.tsx                        # Login page (root)
│   ├── layout.tsx                      # Root layout with AuthProvider
│   ├── auth/                           # Auth pages (UI)
│   │   ├── register/page.tsx
│   │   ├── verify-login/page.tsx
│   │   ├── verify-registration/page.tsx
│   │   ├── magic-link-sent/page.tsx
│   │   └── callback/page.tsx           # OAuth callback
│   ├── api/
│   │   ├── auth/                       # Auth API routes (server-only)
│   │   │   ├── verify-login/route.ts   # Sets httpOnly session cookie
│   │   │   ├── verify-registration/route.ts
│   │   │   ├── session/route.ts        # Session validity check
│   │   │   └── logout/route.ts         # Clears session cookie
│   │   └── xrpc/[...path]/route.ts     # Catch-all AppView proxy
│   ├── home/page.tsx
│   ├── proposals/page.tsx
│   └── [slug]/page.tsx                 # CMS pages
├── lib/
│   ├── AuthContext.tsx                  # Auth state management
│   ├── agent.ts                        # AT Protocol agent + AppView calls
│   ├── useAppPassword.ts               # App password hook
│   ├── oauthClient.ts                  # OAuth client config
│   └── cms.ts                          # CMS client
└── components/
    └── RichText.tsx                     # Lexical JSON renderer
```

### `app/auth/` vs `app/api/auth/`

Both folders deal with authentication but serve different roles:

- **`app/auth/`** contains **pages** — React components rendered in the browser. These are the UI screens the user sees: the registration form, the "check your email" message, the verification spinner, and the OAuth callback handler.

- **`app/api/auth/`** contains **API routes** — server-only Node.js handlers that return JSON. These exist because the verify-login and verify-registration flows need to intercept the AppView response, extract the `session_token`, and set it as an `httpOnly` cookie before returning user data to the client. The catch-all XRPC proxy (`app/api/xrpc/`) can't do this since it forwards responses as-is.

The page at `app/auth/verify-login/page.tsx` calls the API route at `app/api/auth/verify-login/route.ts`, which in turn calls the AppView. This is intentional: the session token never reaches the browser's JavaScript.

## Security Notes

- Session tokens are stored in `httpOnly` cookies, not accessible to client JS
- All AppView calls are proxied server-side via Next.js API routes
- `APPVIEW_URL` is a server-only env var (not exposed to the browser)
- OAuth uses PKCE with DPoP-bound access tokens
- For production, use HTTPS with a real domain
- Loopback clients (127.0.0.1) are for development only

## Tech Stack

- **Next.js** - Framework (App Router, standalone mode)
- **React 19** - UI framework
- **TypeScript** - Type safety
- **@atproto/oauth-client-browser** - AT Protocol OAuth
- **Payload CMS** - Content management (external service)
