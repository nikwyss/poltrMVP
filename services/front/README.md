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
├── lib/
│   ├── oauthClient.ts      # OAuth client configuration
│   ├── AuthContext.tsx     # Authentication state management
│   ├── oauth.ts            # OAuth utilities (PKCE, state)
│   └── atproto.ts          # AT Protocol helpers
├── pages/
│   ├── Login.tsx           # Login page with handle input
│   ├── Callback.tsx        # OAuth callback handler
│   └── Home.tsx            # Protected home page
└── App.tsx                 # Main app with routing
```

## Security Notes

- ✅ Uses PKCE for public client security
- ✅ DPoP-bound access tokens enabled
- ✅ State parameter validation handled automatically
- ✅ Tokens stored securely in IndexedDB
- ⚠️ For production, use HTTPS with a real domain
- ⚠️ Loopback clients (127.0.0.1) are for development only

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **@atproto/oauth-client-browser** - AT Protocol OAuth
- **Nginx** (Docker) - Production web server
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
