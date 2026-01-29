# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8 --activate

# Build-time arguments for Next.js public env vars (can override at build time)
ARG NEXT_PUBLIC_REDIRECT_URI=https://eidproto.poltr.info/callback
ARG NEXT_PUBLIC_CLIENT_ID_BASE=https://eidproto.poltr.info
ARG NEXT_PUBLIC_HANDLE_RESOLVER=https://bsky.social
ENV NEXT_PUBLIC_REDIRECT_URI=$NEXT_PUBLIC_REDIRECT_URI
ENV NEXT_PUBLIC_CLIENT_ID_BASE=$NEXT_PUBLIC_CLIENT_ID_BASE
ENV NEXT_PUBLIC_HANDLE_RESOLVER=$NEXT_PUBLIC_HANDLE_RESOLVER

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Runtime environment variables are set via Kubernetes secrets:
# - EIDPROTO_EID_VERIFIER_API
# - EIDPROTO_EID_TRUSTED_ISSUER_DID
# - EIDPROTO_EID_HASH_SECRET
# - EIDPROTO_SIGNING_KEY_SEED
# - EIDPROTO_JWT_SECRET
# - EIDPROTO_SERVER_DID

CMD ["node", "server.js"]
