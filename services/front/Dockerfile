# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Build-time arguments for Next.js public env vars (inlined into JS bundles at build time)
ARG NEXT_PUBLIC_REDIRECT_URI
ARG NEXT_PUBLIC_CLIENT_ID_BASE
ARG NEXT_PUBLIC_PDS_URL
ARG NEXT_PUBLIC_HANDLE_RESOLVER
ENV NEXT_PUBLIC_REDIRECT_URI=$NEXT_PUBLIC_REDIRECT_URI
ENV NEXT_PUBLIC_CLIENT_ID_BASE=$NEXT_PUBLIC_CLIENT_ID_BASE
ENV NEXT_PUBLIC_PDS_URL=$NEXT_PUBLIC_PDS_URL
ENV NEXT_PUBLIC_HANDLE_RESOLVER=$NEXT_PUBLIC_HANDLE_RESOLVER

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

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

CMD ["node", "server.js"]
