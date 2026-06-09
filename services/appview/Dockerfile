FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 3000

# --proxy-headers + --forwarded-allow-ips='*': honor the ingress X-Forwarded-For
# so the rate limiter keys on the real client IP, not the ingress pod IP.
# Safe: pod is only reachable via the in-cluster ingress. See doc/SECURITY_AUTH.md #1.
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3000", "--proxy-headers", "--forwarded-allow-ips=*"]
