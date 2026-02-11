# Minimal image to run the indexer
FROM node:20-alpine

# Set work directory
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev


# Copy source
COPY ./src ./src
# COPY ./README.md ./

# Environment defaults (override at runtime as needed)
ENV NODE_ENV=production 
# PDS_HOSTNAME=pds.poltr.info 
# INDEXER_POSTGRES_URL=postgres://postgres:postgres@postgres:5432/postgres

# Run the indexer
CMD ["node", "src/main.js"]
