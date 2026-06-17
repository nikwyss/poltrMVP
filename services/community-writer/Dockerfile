FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Reiner Hintergrund-Worker (kein HTTP-Server, kein EXPOSE): Crosspost +
# Translation + Acceptance-Pipeline. Siehe doc/ATPROTO_NATIVE_DELIBERATION.md.
# src/shared/ enthält manuell aus services/appview gesyncte Module (pds_creds,
# db, errors, languages) — beim Ändern dort drüben mitziehen.
CMD ["python", "-m", "src.main"]
