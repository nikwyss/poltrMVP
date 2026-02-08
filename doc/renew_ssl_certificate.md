# Wildcard SSL Certificate Renewal for *.poltr.info

**Certificate expires every 90 days.** Current certificate valid until: **April 28, 2026**

## Prerequisites

- SSH access to the server
- Access to Infomaniak DNS management: https://manager.infomaniak.com

---

## Step 1: Request New Certificate

Run certbot to start the renewal process:

```bash
sudo certbot certonly --manual --preferred-challenges dns -d "*.poltr.info"
```

Certbot will display a challenge like this:

```
Please deploy a DNS TXT record under the name:

_acme-challenge.poltr.info

with the following value:

XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

Press Enter to Continue
```

**IMPORTANT:** Do NOT press Enter yet! First complete Step 2.

---

## Step 2: Add DNS TXT Record

1. Go to **Infomaniak Manager**: https://manager.infomaniak.com

2. Navigate to: **Web & Domains** → **poltr.info** → **DNS Zone**

3. Find the existing `_acme-challenge` TXT record and **edit** it (or create new if not exists):
   - **Type:** TXT
   - **Name:** `_acme-challenge`
   - **TTL:** 3600
   - **Value:** The challenge value from certbot (the XXXX... string)

4. Save the record

5. Wait for DNS propagation (usually 1-5 minutes). Verify with:

```bash
dig TXT _acme-challenge.poltr.info +short
```

You should see your challenge value in quotes.

---

## Step 3: Complete Certbot Challenge

Once DNS is propagated, go back to the terminal and press **Enter**.

Certbot will verify the DNS record and issue the certificate.

Success message:

```
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/poltr.info/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/poltr.info/privkey.pem
```

---

## Step 4: Update Kubernetes Secret

Delete the old secret and create a new one with the renewed certificate:

```bash
# Delete old secret
kubectl delete secret poltr-wildcard-tls -n poltr

# Create new secret with renewed certificate
sudo kubectl create secret tls poltr-wildcard-tls \
  --cert=/etc/letsencrypt/live/poltr.info/fullchain.pem \
  --key=/etc/letsencrypt/live/poltr.info/privkey.pem \
  -n poltr
```

---

## Step 5: Restart Ingress Controller

Force the ingress to reload the new certificate:

```bash
kubectl rollout restart deployment ingress-nginx-controller -n ingress-nginx
```

---

## Step 6: Verify

Test that the new certificate is active:

```bash
echo | openssl s_client -servername smartinfo.poltr.info -connect smartinfo.poltr.info:443 2>/dev/null | openssl x509 -noout -dates
```

You should see the new expiry date (90 days from now).

---

## Quick Reference (All Commands)

```bash
# 1. Request certificate (then add TXT record in Infomaniak before pressing Enter)
sudo certbot certonly --manual --preferred-challenges dns -d "*.poltr.info"

# 2. Check DNS propagation
dig TXT _acme-challenge.poltr.info +short

# 3. Update Kubernetes secret
kubectl delete secret poltr-wildcard-tls -n poltr
sudo kubectl create secret tls poltr-wildcard-tls \
  --cert=/etc/letsencrypt/live/poltr.info/fullchain.pem \
  --key=/etc/letsencrypt/live/poltr.info/privkey.pem \
  -n poltr

# 4. Restart ingress
kubectl rollout restart deployment ingress-nginx-controller -n ingress-nginx

# 5. Verify
echo | openssl s_client -servername smartinfo.poltr.info -connect smartinfo.poltr.info:443 2>/dev/null | openssl x509 -noout -dates
```

---

## Reminder

Set a calendar reminder for **April 20, 2026** (1 week before expiry) to renew the certificate.
