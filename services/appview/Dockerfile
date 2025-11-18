# Multi-process container running both indexer and main service.
# NOTE: Normally you run one process per container; using a supervisor script here.

FROM node:20-alpine

# Add tini for proper signal handling (PID 1 reaping)
RUN apk add --no-cache tini

WORKDIR /app

# Install dependencies separately for better caching
COPY package*.json ./
RUN npm ci --omit=dev || npm install --production

# Copy source
COPY src ./src
COPY doc ./doc
COPY start.sh ./

# Ensure script is executable
RUN chmod +x start.sh

EXPOSE 3000
# Adjust if indexer exposes its own port; add more EXPOSE lines as needed.

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./start.sh"]
