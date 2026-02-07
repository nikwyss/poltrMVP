# Load Balancing & Ingress

## Current Setup: Dev/Test (hostPort, no LB)

The ingress-nginx controller uses **hostPort** to bind directly to ports 80/443 on the Kubernetes node. A floating IP on the node provides public access. No OpenStack load balancer needed.

```
Internet --> Floating IP (83.228.203.147) --> Node hostPort 80/443 --> ingress-nginx --> Services
```

**Infomaniak resources:**
- Floating IP: ~6.79 CHF/month
- **Total: ~7 CHF/month** (saves ~10 CHF vs LoadBalancer)

**Floating IP:**
- Address: `83.228.203.147`
- ID: `4069d2e8-5ebf-4eb4-9d2c-3294e14d13e4`
- Assigned to node: `ext1-pck-uvgx6be-pjt-pwlbk-g6tz7` (port `4ca92628-33be-47bd-bd32-18c0ac08604d`)

**Security groups on node port** (`4ca92628-33be-47bd-bd32-18c0ac08604d`):
1. `37779f76-2769-486f-ac07-efe752320249` -- K8s-managed (cluster manager reconciles this)
2. `8dcc791b-8fd3-486d-bf7c-8b65362fe11d` (`poltr-ingress-hostport`) -- **ours, not touched by K8s**
   - TCP 80 from 0.0.0.0/0
   - TCP 443 from 0.0.0.0/0

The dedicated security group prevents the K8s cluster manager from wiping our port 80/443 rules
during reconciliation (which happens on node pool changes).

**Kubernetes config:**
- Service type: `ClusterIP` (no LB)
- Deployment: hostPort 80 and 443 on the ingress-nginx-controller pod

**DNS records** (poltr.ch, *.poltr.info) point to `83.228.203.147`.

## Restore Production Setup (Go-Live)

When ready for production, re-enable the OpenStack LoadBalancer for high availability.

### Step 1: Remove hostPort from ingress-nginx

```bash
# Remove hostPort, keep only containerPort
kubectl patch deployment ingress-nginx-controller -n ingress-nginx --type='json' \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/ports","value":[
    {"containerPort":80,"name":"http","protocol":"TCP"},
    {"containerPort":443,"name":"https","protocol":"TCP"},
    {"containerPort":8443,"name":"webhook","protocol":"TCP"}
  ]}]'
```

### Step 2: Switch service to LoadBalancer

```bash
kubectl patch svc ingress-nginx-controller -n ingress-nginx \
  -p '{"spec":{"type":"LoadBalancer","externalTrafficPolicy":"Local"}}'

# Wait for external IP
kubectl get svc -n ingress-nginx ingress-nginx-controller -w
```

### Step 3: Reassign floating IP (OpenStack)

```bash
# Disassociate floating IP from node
openstack floating ip unset --port 4069d2e8-5ebf-4eb4-9d2c-3294e14d13e4

# Find the new LB's VIP port
openstack port list --name "octavia-lb-*" -f json

# Associate floating IP to the LB's VIP port (to keep same IP / no DNS change)
openstack floating ip set --port <LB_VIP_PORT_ID> 4069d2e8-5ebf-4eb4-9d2c-3294e14d13e4
```

If the LB gets its own floating IP automatically, you may instead:
1. Release the node floating IP: `openstack floating ip delete 4069d2e8-5ebf-4eb4-9d2c-3294e14d13e4`
2. Update DNS records to the new LB IP

### Step 4: Clean up security group rules

The port 80/443 rules on the node security group are no longer needed (the LB handles this):

```bash
openstack security group rule delete caedf663-c550-4bb6-be8d-da91ba4fef06  # port 80
openstack security group rule delete 9bee9d92-3891-46a3-bd96-8fff34bea085  # port 443
```

### Full ingress-nginx LoadBalancer service manifest (for reference)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: ingress-nginx-controller
  namespace: ingress-nginx
  labels:
    app.kubernetes.io/component: controller
    app.kubernetes.io/instance: ingress-nginx
    app.kubernetes.io/name: ingress-nginx
    app.kubernetes.io/part-of: ingress-nginx
    app.kubernetes.io/version: "1.10.0"
spec:
  type: LoadBalancer
  externalTrafficPolicy: Local
  ipFamilies:
    - IPv4
  ipFamilyPolicy: SingleStack
  ports:
    - appProtocol: http
      name: http
      port: 80
      protocol: TCP
      targetPort: http
    - appProtocol: https
      name: https
      port: 443
      protocol: TCP
      targetPort: https
  selector:
    app.kubernetes.io/component: controller
    app.kubernetes.io/instance: ingress-nginx
    app.kubernetes.io/name: ingress-nginx
```

## Alternative: No Public Access (saves ~17 CHF/month)

For purely local development, skip the floating IP entirely and use port-forwarding:

```bash
kubectl port-forward -n poltr deploy/frontend 3000:3000
kubectl port-forward -n poltr deploy/cms 3001:3000
kubectl port-forward -n poltr deploy/appview 3002:3000
```

## Cost Summary

| Setup | LB | Floating IP | Total | Use case |
|-------|-----|------------|-------|----------|
| Production (LoadBalancer) | ~10.19 | ~6.79 | **~17 CHF/month** | Go-live |
| **Dev/Test (hostPort + floating IP)** | **0** | **~6.79** | **~7 CHF/month** | **Current** |
| Local only (port-forward) | 0 | 0 | **0 CHF/month** | Local dev |
