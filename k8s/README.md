# IdeaMine Kubernetes Deployment Guide

Complete Kubernetes configuration for deploying IdeaMine orchestrator to production.

---

## Prerequisites

- Kubernetes cluster (1.24+)
- `kubectl` configured
- Helm 3+ (optional, for some components)
- cert-manager (for TLS certificates)
- NGINX Ingress Controller

---

## Quick Start (5 Steps)

### 1. Create Namespace

```bash
kubectl apply -f namespace.yaml
```

### 2. Configure Secrets

**IMPORTANT:** Do not use the template values in production!

```bash
# Create secrets from .env file
kubectl create secret generic ideamine-secrets \
  --from-literal=DATABASE_URL='postgresql://user:STRONG_PASSWORD@postgres:5432/ideamine' \
  --from-literal=REDIS_URL='redis://redis:6379' \
  --from-literal=ANTHROPIC_API_KEY='sk-ant-YOUR_KEY_HERE' \
  --from-literal=JWT_SECRET='$(openssl rand -base64 32)' \
  --from-literal=JAEGER_ENDPOINT='http://jaeger:14268/api/traces' \
  --from-literal=OTEL_SERVICE_NAME='ideamine-orchestrator' \
  -n ideamine

# Create PostgreSQL password
kubectl create secret generic postgres-secrets \
  --from-literal=postgres-password='$(openssl rand -base64 32)' \
  -n ideamine
```

### 3. Apply Configurations

```bash
# Apply in order
kubectl apply -f configmap.yaml
kubectl apply -f postgres.yaml
kubectl apply -f redis.yaml
kubectl apply -f jaeger.yaml
kubectl apply -f orchestrator.yaml
kubectl apply -f worker.yaml
kubectl apply -f api.yaml
kubectl apply -f ingress.yaml
```

### 4. Run Database Migrations

```bash
# Wait for PostgreSQL to be ready
kubectl wait --for=condition=ready pod -l app=postgres -n ideamine --timeout=300s

# Run migrations
kubectl exec -it postgres-0 -n ideamine -- psql -U ideamine -d ideamine <<EOF
\i /migrations/008_foundation_tables.sql
\i /migrations/009_execution_tables.sql
\i /migrations/010_observability_tables.sql
\i /migrations/011_knowledge_refinery.sql
\i /migrations/012_clarification_loops.sql
\i /migrations/013_optional_tables.sql
EOF
```

Alternatively, copy migration files and run them:

```bash
# Copy migrations to pod
for file in ../migrations/*.sql; do
  kubectl cp "$file" ideamine/postgres-0:/tmp/
done

# Execute migrations
kubectl exec -it postgres-0 -n ideamine -- bash -c '
  for file in /tmp/*.sql; do
    psql -U ideamine -d ideamine -f "$file"
  done
'
```

### 5. Verify Deployment

```bash
# Check all pods are running
kubectl get pods -n ideamine

# Check services
kubectl get svc -n ideamine

# Check ingress
kubectl get ingress -n ideamine

# View logs
kubectl logs -l app=orchestrator -n ideamine --tail=50

# Test API health
kubectl port-forward svc/api 9002:9002 -n ideamine
curl http://localhost:9002/api/health
```

---

## Configuration Files

| File | Purpose |
|------|---------|
| `namespace.yaml` | Creates ideamine namespace |
| `secrets.yaml` | Secret template (DO NOT USE IN PROD) |
| `configmap.yaml` | Non-sensitive configuration |
| `postgres.yaml` | PostgreSQL StatefulSet with persistence |
| `redis.yaml` | Redis deployment with persistence |
| `jaeger.yaml` | Jaeger distributed tracing |
| `orchestrator.yaml` | Core orchestrator deployment |
| `worker.yaml` | Worker deployment with HPA |
| `api.yaml` | REST API deployment with HPA |
| `ingress.yaml` | NGINX ingress for external access |

---

## Scaling

### Manual Scaling

```bash
# Scale workers
kubectl scale deployment worker --replicas=20 -n ideamine

# Scale API
kubectl scale deployment api --replicas=5 -n ideamine

# Scale orchestrator
kubectl scale deployment orchestrator --replicas=3 -n ideamine
```

### Horizontal Pod Autoscaling (HPA)

HPA is configured for workers and API:

**Workers:**
- Min: 5 replicas
- Max: 100 replicas
- Target CPU: 70%
- Target Memory: 80%

**API:**
- Min: 3 replicas
- Max: 20 replicas
- Target CPU: 70%
- Target Memory: 80%

```bash
# View HPA status
kubectl get hpa -n ideamine

# Describe HPA
kubectl describe hpa worker-hpa -n ideamine
kubectl describe hpa api-hpa -n ideamine
```

---

## Monitoring

### View Logs

```bash
# Orchestrator logs
kubectl logs -l app=orchestrator -n ideamine --tail=100 -f

# Worker logs
kubectl logs -l app=worker -n ideamine --tail=100 -f

# API logs
kubectl logs -l app=api -n ideamine --tail=100 -f

# All logs from specific pod
kubectl logs <pod-name> -n ideamine -f
```

### Access Jaeger UI

```bash
# Port forward Jaeger
kubectl port-forward svc/jaeger 16686:16686 -n ideamine

# Open browser
open http://localhost:16686
```

### Database Access

```bash
# Connect to PostgreSQL
kubectl exec -it postgres-0 -n ideamine -- psql -U ideamine -d ideamine

# Run queries
psql> SELECT COUNT(*) FROM workflow_runs;
psql> SELECT * FROM phases WHERE status='running';
psql> \dt  # List tables
```

### Redis Access

```bash
# Connect to Redis
kubectl exec -it $(kubectl get pod -l app=redis -n ideamine -o jsonpath='{.items[0].metadata.name}') -n ideamine -- redis-cli

# View queue status
127.0.0.1:6379> XLEN orchestrator:tasks
127.0.0.1:6379> KEYS *
```

---

## Troubleshooting

### Pods Not Starting

```bash
# Check pod events
kubectl describe pod <pod-name> -n ideamine

# Check pod logs
kubectl logs <pod-name> -n ideamine

# Check resource constraints
kubectl top pods -n ideamine
```

### Database Connection Issues

```bash
# Test PostgreSQL connectivity
kubectl exec -it postgres-0 -n ideamine -- pg_isready -U ideamine

# Check PostgreSQL logs
kubectl logs postgres-0 -n ideamine

# Verify secret exists
kubectl get secret ideamine-secrets -n ideamine -o yaml
```

### Worker Scaling Issues

```bash
# Check HPA metrics
kubectl get hpa worker-hpa -n ideamine

# Describe HPA for more details
kubectl describe hpa worker-hpa -n ideamine

# Check metrics server
kubectl top nodes
kubectl top pods -n ideamine
```

### Ingress Not Working

```bash
# Check ingress
kubectl describe ingress ideamine-ingress -n ideamine

# Check ingress controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx

# Test service directly
kubectl port-forward svc/api 9002:9002 -n ideamine
```

---

## Upgrades

### Rolling Updates

```bash
# Update image
kubectl set image deployment/orchestrator orchestrator=ideamine/orchestrator:v2.0.0 -n ideamine
kubectl set image deployment/worker worker=ideamine/worker:v2.0.0 -n ideamine
kubectl set image deployment/api api=ideamine/api:v2.0.0 -n ideamine

# Watch rollout
kubectl rollout status deployment/orchestrator -n ideamine

# Rollback if needed
kubectl rollout undo deployment/orchestrator -n ideamine
```

### Database Migrations

```bash
# Always backup before migrations
kubectl exec -it postgres-0 -n ideamine -- pg_dump -U ideamine ideamine > backup.sql

# Run new migration
kubectl cp new_migration.sql ideamine/postgres-0:/tmp/
kubectl exec -it postgres-0 -n ideamine -- psql -U ideamine -d ideamine -f /tmp/new_migration.sql
```

---

## Backup and Recovery

### PostgreSQL Backup

```bash
# Create backup
kubectl exec -it postgres-0 -n ideamine -- pg_dump -U ideamine ideamine | gzip > ideamine_backup_$(date +%Y%m%d).sql.gz

# Restore backup
gunzip -c ideamine_backup_20251020.sql.gz | kubectl exec -i postgres-0 -n ideamine -- psql -U ideamine -d ideamine
```

### Redis Backup

```bash
# Trigger save
kubectl exec -it $(kubectl get pod -l app=redis -n ideamine -o jsonpath='{.items[0].metadata.name}') -n ideamine -- redis-cli BGSAVE

# Copy dump file
kubectl cp ideamine/$(kubectl get pod -l app=redis -n ideamine -o jsonpath='{.items[0].metadata.name}'):/data/dump.rdb ./redis_backup_$(date +%Y%m%d).rdb
```

---

## Security

### Update Secrets

```bash
# Update Anthropic API key
kubectl create secret generic ideamine-secrets \
  --from-literal=ANTHROPIC_API_KEY='new-key' \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart deployments to pick up new secret
kubectl rollout restart deployment orchestrator -n ideamine
kubectl rollout restart deployment worker -n ideamine
kubectl rollout restart deployment api -n ideamine
```

### Network Policies

```bash
# Apply network policies (create separate file)
kubectl apply -f network-policies.yaml -n ideamine
```

---

## Performance Tuning

### Resource Limits

Edit deployment YAMLs to adjust resources:

```yaml
resources:
  requests:
    memory: "2Gi"
    cpu: "1000m"
  limits:
    memory: "4Gi"
    cpu: "2000m"
```

### PostgreSQL Tuning

```bash
# Edit PostgreSQL config
kubectl edit statefulset postgres -n ideamine

# Add PostgreSQL performance args:
# - "-c"
# - "shared_buffers=2GB"
# - "-c"
# - "effective_cache_size=6GB"
# - "-c"
# - "max_connections=200"
```

---

## Cost Optimization

### Resource Recommendations

**Development:**
- Orchestrator: 2 replicas, 512Mi/500m CPU
- Workers: 5 replicas, 1Gi/1 CPU
- API: 2 replicas, 256Mi/250m CPU
- PostgreSQL: 1 replica, 1Gi/500m CPU
- Redis: 1 replica, 512Mi/250m CPU

**Production:**
- Orchestrator: 3 replicas, 1Gi/1 CPU
- Workers: 10-50 replicas (HPA), 2Gi/1 CPU
- API: 5-10 replicas (HPA), 512Mi/500m CPU
- PostgreSQL: 1 replica (or HA setup), 4Gi/2 CPU
- Redis: 1 replica (or HA setup), 2Gi/1 CPU

**High Scale:**
- Orchestrator: 5 replicas, 2Gi/2 CPU
- Workers: 25-100 replicas (HPA), 4Gi/2 CPU
- API: 10-20 replicas (HPA), 1Gi/1 CPU
- PostgreSQL: HA setup (3 replicas), 8Gi/4 CPU
- Redis: Cluster (3+ nodes), 4Gi/2 CPU

---

## Next Steps

1. Configure DNS to point to your ingress
2. Set up cert-manager for TLS certificates
3. Configure monitoring (Prometheus + Grafana)
4. Set up log aggregation (ELK or Loki)
5. Configure alerting (Alertmanager)
6. Set up backup automation
7. Implement disaster recovery plan

---

## Support

For issues with Kubernetes deployment, check:
- Pod logs: `kubectl logs -n ideamine`
- Events: `kubectl get events -n ideamine`
- Resources: `kubectl top pods -n ideamine`
- Describe: `kubectl describe <resource> -n ideamine`
