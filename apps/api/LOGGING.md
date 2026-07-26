# Production Observability & Logging

> DOC-009 §8.4 — Winston structured logging, request correlation, sensitive data masking, ELK integration, and Datadog APM hooks for the Zayjar API.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     Zayjar Logging Pipeline                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Request Flow:                                                     │
│  Client → CorrelationIdMiddleware → HttpLoggingMiddleware          │
│         → SanitizationMiddleware → TenantContext → Route Handler   │
│                                                                    │
│  Logging Layer:                                                    │
│  ┌─────────────────┐    ┌──────────────────┐    ┌──────────────┐ │
│  │ ZayjarLogger     │───▶│ Winston Transports │───▶│ Console      │ │
│  │ (NestJS adapter) │    │                  │───▶│ DailyRotate  │ │
│  └─────────────────┘    │                  │───▶│ Error-only   │ │
│                          └──────────────────┘    └──────────────┘ │
│                                    │                               │
│                          ┌─────────▼─────────┐                   │
│                          │ Sensitive Data     │                   │
│                          │ Masking (auto)     │                   │
│                          └───────────────────┘                   │
│                                                                    │
│  Observability Layer:                                              │
│  ┌──────────────────┐    ┌──────────────────┐                    │
│  │ Datadog APM      │    │ ELK Stack        │                    │
│  │ (dd-trace)       │    │ (JSON → Filebeat │                    │
│  │ Optional         │    │  → Logstash)     │                    │
│  └──────────────────┘    └──────────────────┘                    │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

## Log Levels

| Level | When to Use | Production |
|-------|-------------|------------|
| `error` | Unrecoverable errors, system failures | ✅ Always on |
| `warn` | Degraded state, recoverable issues | ✅ Always on |
| `info` | Normal operations, audit events | ✅ Always on |
| `debug` | Detailed diagnostic information | ⚠️ Debug only |
| `verbose` | Maximum detail, development only | ❌ Off in production |

## JSON Log Format (Production)

```json
{
  "level": "info",
  "message": "HTTP Request",
  "context": "HTTP",
  "service": "zayjar-api",
  "timestamp": "2026-07-26T14:30:00.000Z",
  "method": "POST",
  "url": "/api/v1/orders",
  "statusCode": 201,
  "duration": 42,
  "correlationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "meta": {
    "tenantId": "t_abc123",
    "userId": "u_xyz789"
  }
}
```

## Sensitive Data Masking

The logging system automatically masks all sensitive fields before they reach any transport:

### Automatically Masked Fields

| Pattern | Example Fields |
|---------|---------------|
| `password`, `passwd` | `password`, `userPassword`, `oldPassword` |
| `token`, `*_token` | `token`, `accessToken`, `refreshToken`, `jwt_token` |
| `secret`, `*_key` | `secret`, `secretKey`, `apiKey`, `privateKey` |
| `authorization` | `authorization`, `Authorization` header |
| `cookie`, `session` | `cookie`, `session`, `sessionId` |
| `credit_card`, `ssn`, `pin`, `otp` | Payment/identity fields |

### Masking Behavior

```
Input:  "password": "super-secret-123"
Output: "password": "su**************23"

Input:  "token": "eyJhbGciOiJIUzI1NiJ9..."
Output: "token": "ey**********************"
```

### Manual Masking

```typescript
import { sensitiveFieldsMask } from './common/logging/sensitive-data.mask';

const masked = sensitiveFieldsMask({
  apiKey: 'sk_live_abc123',
  name: 'John',
}, ['customField']);
```

## Request ID Correlation

Every HTTP request gets a correlation ID:

1. Client sends `X-Request-ID` header → used as-is
2. No header → UUID v4 generated automatically
3. ID propagated through all log entries for that request
4. ID returned in response `X-Request-ID` header

### Usage in Service Code

```typescript
import { createPerformanceLogger } from './common/logging/performance';

const perf = createPerformanceLogger('OrderService');

// Measure sync operations
const result = perf.measure('validateOrder', () => {
  return validateOrder(order);
});

// Measure async operations
const order = await perf.measureAsync('createOrder', async () => {
  return await this.prisma.order.create({ data });
});
```

## File Log Rotation

| Setting | Value |
|---------|-------|
| Filename | `zayjar-api-%DATE%.log` |
| Date pattern | `YYYY-MM-DD` |
| Max file size | 50MB |
| Retention | 14 days (general), 30 days (errors) |
| Compression | Gzip archived |
| Error-only file | `zayjar-error-%DATE%.log` |

## Environment Variables

```bash
# Logging
LOG_LEVEL=info                    # error | warn | info | debug | verbose
LOG_DIR=/var/log/zayjar           # Log file directory
LOG_FILE_ENABLED=true             # Enable file transport in non-production

# Datadog APM (optional)
DD_AGENT_HOST=localhost           # Datadog agent hostname
DD_TRACE_AGENT_PORT=8126          # Datadog agent port
DD_SERVICE=zayjar-api             # Service name in Datadog
DD_ENV=production                 # Environment tag
DD_VERSION=1.0.0                  # Version tag
DD_TRACE_SAMPLE_RATE=1            # Sampling rate (0-1)
```

## ELK Stack Integration

### Filebeat Configuration

```yaml
filebeat.inputs:
  - type: container
    paths:
      - /var/log/zayjar/zayjar-api-*.log
    json.keys_under_root: true
    json.add_error_key: true
    json.message_key: message

output.logstash:
  hosts: ["logstash:5044"]

processors:
  - add_kubernetes_metadata:
      host: ${NODE_NAME}
  - add_docker_metadata: ~
```

### Logstash Pipeline

```ruby
input {
  beats {
    port => 5044
  }
}

filter {
  json {
    source => "message"
  }
  date {
    match => ["timestamp", "ISO8601"]
  }
  mutate {
    add_field => { "service" => "zayjar-api" }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "zayjar-api-%{+YYYY.MM.dd}"
  }
}
```

## Datadog APM Integration

### Initialization

Datadog tracer initializes automatically when `DD_AGENT_HOST` is set:

```bash
# Enable Datadog
DD_AGENT_HOST=datadog-agent DD_SERVICE=zayjar-api node apps/api/dist/main.js

# Disable Datadog (default)
node apps/api/dist/main.js
```

### Custom Tracing

```typescript
import { traceAsync, addTag } from './common/logging/datadog-apm';

const result = await traceAsync('order.create', async () => {
  addTag('tenant.id', tenantId);
  return await this.createOrder(data);
});
```

## Kubernetes Integration

Logging works with K8s deployment — stdout/stderr captured by container runtime:

```yaml
# Logs are available via:
kubectl logs -l app.kubernetes.io/name=api -n zayjar
kubectl logs -l app.kubernetes.io/name=api -n zayjar --previous  # crashed pod
```

## Quick Reference

| Action | Command |
|--------|---------|
| View logs | `kubectl logs -l app.kubernetes.io/name=api -n zayjar -f` |
| Search errors | `kubectl logs -l app.kubernetes.io/name=api -n zayjar \| grep '"level":"error"'` |
| Local dev logs | `LOG_LEVEL=debug pnpm --filter api start:dev` |
| Enable file logs | `LOG_FILE_ENABLED=true pnpm --filter api start` |
| Datadog (local) | `DD_AGENT_HOST=localhost pnpm --filter api start` |
