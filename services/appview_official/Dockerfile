# THIS IS A FORK OF ./vendor/atproto/services/bsky/Dockerfile

FROM node:20.11-alpine AS build

RUN corepack enable

WORKDIR /app

COPY ./vendor/atproto/package.json ./
RUN corepack prepare --activate

# Move files into the image and install
COPY ./vendor/atproto/*.* ./
COPY ./vendor/atproto/tsconfig ./tsconfig
COPY ./vendor/atproto/packages/bsky ./packages/bsky
COPY ./vendor/atproto/packages/api ./packages/api
COPY ./vendor/atproto/packages/common ./packages/common
COPY ./vendor/atproto/packages/common-web ./packages/common-web
COPY ./vendor/atproto/packages/crypto ./packages/crypto
COPY ./vendor/atproto/packages/did ./packages/did
COPY ./vendor/atproto/packages/identity ./packages/identity
COPY ./vendor/atproto/packages/sync ./packages/sync
COPY ./vendor/atproto/packages/syntax ./packages/syntax
COPY ./vendor/atproto/packages/lexicon ./packages/lexicon
COPY ./vendor/atproto/packages/repo ./packages/repo
COPY ./vendor/atproto/packages/xrpc ./packages/xrpc
COPY ./vendor/atproto/packages/xrpc-server ./packages/xrpc-server
COPY ./vendor/atproto/packages/internal/fetch-node ./packages/internal/fetch-node
COPY ./vendor/atproto/packages/internal/fetch ./packages/internal/fetch
COPY ./vendor/atproto/packages/internal/pipe ./packages/internal/pipe
COPY ./vendor/atproto/packages/internal/xrpc-utils ./packages/internal/xrpc-utils
COPY ./vendor/atproto/services/bsky ./services/bsky

# POLTR CHANGES
COPY ./services/appview/*.* ./

# install all deps
RUN pnpm install --frozen-lockfile > /dev/null
# build all packages with external node_modules
RUN pnpm build > /dev/null
# clean up
RUN rm -rf node_modules
# install only prod deps, hoisted to root node_modules dir
RUN pnpm install --prod --shamefully-hoist --frozen-lockfile --prefer-offline > /dev/null

WORKDIR services/bsky

# Uses assets from build stage to reduce build size
FROM node:20.11-alpine

# dumb-init is used to handle signals properly.
# runit is installed so it can be (optionally) used for logging via svlogd.
RUN apk add --update dumb-init runit


# Avoid zombie processes, handle signal forwarding
ENTRYPOINT ["dumb-init", "--"]

WORKDIR /app/services/bsky
COPY --from=build /app /app

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

# https://github.com/nodejs/docker-node/blob/master/docs/BestPractices.md#non-root-user
USER node
CMD ["node", "--heapsnapshot-signal=SIGUSR2", "--enable-source-maps", "api.js"]

LABEL org.opencontainers.image.source=https://github.com/bluesky-social/atproto
LABEL org.opencontainers.image.description="Poltr App View"
LABEL org.opencontainers.image.licenses=MIT
