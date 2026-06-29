# postgres:15-alpine + pgvector — drop-in-Ersatz für das bestehende
# allforone-postgres-Deployment.
#
# Warum nicht das offizielle pgvector/pgvector:pg15? Das ist Debian-basiert
# (glibc, postgres-uid 999). Auf dem bestehenden, von postgres:15-alpine (musl,
# uid 70) angelegten Cinder/ext4-Volume startet es nicht (CrashLoop, mkdir
# Permission denied) und brächte zusätzlich eine Collation-Migration
# (en_US.utf8 musl→glibc → REINDEX aller DBs). Mit derselben alpine-Basis
# entfällt beides: gleiche libc, gleiche uid → echtes Drop-in, nur die
# `vector`-Extension kommt dazu.
#
# Build & Push (Beispiel — an euren ghcr-Namespace anpassen):
#   docker build -t ghcr.io/nikwyss/poltr-postgres-pgvector:pg15 infra/docker/postgres-pgvector
#   docker push  ghcr.io/nikwyss/poltr-postgres-pgvector:pg15
# Danach in infra/kube/postgres.yaml das Image auf dieses Tag setzen.

FROM postgres:15-alpine

ARG PGVECTOR_VERSION=v0.8.0

# clang/llvm werden für die JIT-Bitcode-Erzeugung von pgvector gebraucht. Die
# Versionsnummern müssen zur alpine-Version des postgres:15-alpine-Basisimages
# passen (aktuell alpine 3.21 → clang19/llvm19). Bei einem Basis-Update ggf.
# anpassen (Fehlermeldung nennt die fehlenden Pakete).
RUN set -eux; \
    apk add --no-cache --virtual .build-deps \
        build-base git clang19 llvm19; \
    git clone --branch "${PGVECTOR_VERSION}" --depth 1 \
        https://github.com/pgvector/pgvector.git /tmp/pgvector; \
    cd /tmp/pgvector; \
    make; \
    make install; \
    apk del .build-deps; \
    rm -rf /tmp/pgvector
