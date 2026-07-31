# Kubernetes Production Deployment — DOC-010 §9.5

> Production-grade Kubernetes manifests for the Zayjar Restaurant SaaS Platform.

## Directory Structure

```
k8s/
├── namespace.yml              # zayjar namespace
├── configmap.yml              # Non-sensitive configuration
├── secrets.yml                # Secret placeholders (replace with external secrets)
├── ingress.yml                # NGINX Ingress with TLS termination
├── kustomization.yml          # Kustomize resource manifest
├── postgres/
│   ├── statefulset.yml        # PostgreSQL 15 StatefulSet + PVC
│   ├── service.yml            # ClusterIP service
│   └── configmap.yml          # pg_hba.conf + postgresql.conf
├── redis/
│   ├── deployment.yml         # Redis 7.2 Deployment
│   ├── service.yml            # ClusterIP service
│   └── configmap.yml          # redis.conf
├── pgbouncer/
│   ├── deployment.yml         # PgBouncer connection pooler (2 replicas)
│   ├── service.yml            # ClusterIP service
│   └── configmap.yml          # pgbouncer.ini + userlist.txt
├── api/
│   ├── deployment.yml         # NestJS API (2-10 pods via HPA)
│   ├── service.yml            # ClusterIP on port 8000
│   ├── hpa.yml                # HPA: CPU 70% / Memory 80%
│   └── pdb.yml                # PodDisruptionBudget: minAvailable 1
├── worker/
│   ├── deployment.yml         # BullMQ worker (2-6 pods via HPA)
│   └── hpa.yml                # HPA: CPU 75%
├── qr-menu/
│   ├── deployment.yml         # Next.js QR Menu (2 pods)
│   └── service.yml            # ClusterIP on port 3000
├── backoffice/
│   ├── deployment.yml         # Next.js Backoffice (2 pods)
│   └── service.yml            # ClusterIP on port 3001
└── cashier/
    ├── deployment.yml         # Next.js Cashier PWA (2 pods)
    └── service.yml            # ClusterIP on port 3002
```

## Namespace Separation

All resources live in the `zayjar` namespace. Production and staging should use separate namespaces or Kustomize overlays.

## Quick Start

```bash
# Validate manifests
kubectl apply --dry-run=client -f k8s/

# Deploy all resources
kubectl apply -k k8s/

# Or deploy individually
kubectl apply -f k8s/namespace.yml
kubectl apply -f k8s/configmap.yml
kubectl apply -f k8s/secrets.yml
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/redis/
kubectl apply -f k8s/pgbouncer/
kubectl apply -f k8s/api/
kubectl apply -f k8s/worker/
kubectl apply -f k8s/qr-menu/
kubectl apply -f k8s/backoffice/
kubectl apply -f k8s/cashier/
kubectl apply -f k8s/ingress.yml
```

## Resource Allocation

| Component | CPU Request | CPU Limit | Mem Request | Mem Limit | Replicas |
|-----------|-------------|-----------|-------------|-----------|----------|
| PostgreSQL | 500m | 2000m | 1Gi | 2Gi | 1 (StatefulSet) |
| Redis | 250m | 1000m | 256Mi | 512Mi | 1 |
| PgBouncer | 100m | 500m | 128Mi | 256Mi | 2 |
| API | 500m | 2000m | 512Mi | 1Gi | 2-10 (HPA) |
| Worker | 250m | 1000m | 256Mi | 512Mi | 2-6 (HPA) |
| QR Menu | 100m | 500m | 128Mi | 512Mi | 2 |
| Backoffice | 100m | 500m | 128Mi | 512Mi | 2 |
| Cashier | 100m | 500m | 128Mi | 512Mi | 2 |

## Horizontal Pod Autoscaling (HPA)

### API (2-10 pods)
- CPU target: 70% utilization
- Memory target: 80% utilization
- Scale-up: max 2 pods/60s, 60s stabilization
- Scale-down: max 1 pod/120s, 300s stabilization

### Worker (2-6 pods)
- CPU target: 75% utilization
- Scale-up: max 1 pod/60s, 60s stabilization
- Scale-down: max 1 pod/120s, 300s stabilization

## Health Checks

| Component | Liveness | Readiness | Initial Delay |
|-----------|----------|-----------|---------------|
| PostgreSQL | `pg_isready` | `pg_isready` | 30s / 5s |
| Redis | `redis-cli ping` | `redis-cli ping` | 15s / 5s |
| PgBouncer | TCP socket | TCP socket | 10s / 5s |
| API | `GET /health` | `GET /health` | 45s / 10s |
| Worker | `pgrep worker.js` | `pgrep worker.js` | 30s / 10s |
| QR Menu | `GET /` | `GET /` | 30s / 10s |
| Backoffice | `GET /` | `GET /` | 30s / 10s |
| Cashier | `GET /` | `GET /` | 30s / 10s |

## Rolling Update Strategy

All application Deployments use:
- `maxUnavailable: 0` — never reduce below current healthy count
- `maxSurge: 1` — create one extra pod during update
- `terminationGracePeriodSeconds: 30-45s`

This ensures zero-downtime deployments.

## Secrets Management

**All secrets are placeholder references.** Replace with:

1. **Kubernetes External Secrets Operator** (recommended)
2. **AWS Secrets Manager CSI Driver**
3. **HashiCorp Vault Agent Injector**
4. **Sealed Secrets** (for gitOps)

The `secrets.yml` file contains `REPLACE_WITH_KUBERNETES_SECRET` placeholders — never commit real secrets.

## Ingress

- **Class:** NGINX Ingress Controller
- **TLS:** cert-manager with Let's Encrypt ClusterIssuer
- **Hosts:**
  - `api.zayjar.com` → API service (port 8000)
  - `qr.zayjar.com` → QR Menu service (port 3000)
  - `backoffice.zayjar.com` → Backoffice service (port 3001)
  - `cashier.zayjar.com` → Cashier service (port 3002)
- **SSL redirect:** forced
- **Body size limit:** 10MB

## Prerequisites

- Kubernetes 1.25+
- NGINX Ingress Controller
- cert-manager (for TLS)
- StorageClass `gp3` (for PostgreSQL PVC)
- GHCR access token (for pulling images)

## Production Scaling Guidance

### Baseline (small workload)
- API: 2 pods, HPA max 4
- Worker: 2 pods, HPA max 3
- PostgreSQL: 1 replica (consider RDS for HA)

### Growth (100-500 concurrent users)
- API: 4 pods, HPA max 8
- Worker: 3 pods, HPA max 5
- Add read replicas for PostgreSQL
- Redis: enable AOF + RDB persistence

### Scale (500+ concurrent users)
- API: 6-10 pods, HPA max 10
- Worker: 4-6 pods, HPA max 6
- PostgreSQL: RDS Multi-AZ or CloudNativePG operator
- Redis: Redis Sentinel or ElastiCache
- Consider dedicated node pools per component
