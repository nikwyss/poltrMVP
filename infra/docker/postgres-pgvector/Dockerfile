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
# Gebaut via GitHub Actions: .github/workflows/build-postgres-pgvector.yml
# → ghcr.io/<owner>/poltr-postgres-pgvector:pg15
# Danach in infra/kube/postgres.yaml das Image auf dieses Tag setzen.

FROM postgres:15-alpine

ARG PGVECTOR_VERSION=v0.8.0

# Bewusst OHNE clang/llvm: `with_llvm=no` überspringt die JIT-Bitcode-Erzeugung
# von pgvector (optionale Optimierung). So hängt der Build nicht an der
# clang/llvm-Version der Alpine-Basis (3.23) — nur build-base + git nötig.
RUN set -eux; \
    apk add --no-cache --virtual .build-deps build-base git; \
    git clone --branch "${PGVECTOR_VERSION}" --depth 1 \
        https://github.com/pgvector/pgvector.git /tmp/pgvector; \
    cd /tmp/pgvector; \
    make with_llvm=no; \
    make with_llvm=no install; \
    apk del .build-deps; \
    rm -rf /tmp/pgvector
