# Encryption Standards — DOC-006 §5.8

This document defines encryption requirements for the Zayjar platform covering data in transit and at rest.

---

## 1. TLS Transit Encryption (nginx)

All inbound HTTPS traffic is terminated at nginx with the following hardened TLS configuration:

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;
ssl_stapling on;
ssl_stapling_verify on;
```

**Key decisions:**
- TLS 1.0 and 1.1 are disabled; only 1.2 and 1.3 are permitted.
- Cipher suite excludes static RSA, CBC-mode, and weak algorithms.
- OCSP stapling is enabled for faster certificate validation.
- Session tickets are disabled to support forward secrecy.

---

## 2. Redis TLS Configuration

When using a managed Redis service (e.g., AWS ElastiCache, Redis Cloud) that requires TLS, set:

```
REDIS_TLS=true
```

When enabled, the `CacheService` connects to Redis over TLS with `rejectUnauthorized: false` (required for self-signed certificates on managed services).

**For production**, replace `rejectUnauthorized: false` with the CA certificate bundle of your managed Redis provider:

```ts
socket: {
  tls: true,
  ca: fs.readFileSync('/path/to/redis-ca.pem'),
  rejectUnauthorized: true,
}
```

---

## 3. S3 Server-Side Encryption

All objects uploaded to S3 are encrypted at rest using **AES-256 server-side encryption (SSE-S3)**.

This is enforced at the application level by including `ServerSideEncryption: 'AES256'` on every `PutObjectCommand` call in `s3-storage.provider.ts`.

**Optional: SSE-KMS upgrade**

For stricter key management and audit trail, upgrade to SSE-KMS:

1. Create a dedicated KMS key for S3 encryption.
2. Add `ServerSideEncryption: 'aws:kms'` and `SSEKMSKeyId: '<key-arn>'` to the PutObjectCommand.
3. Enforce encryption via a bucket policy:

```json
{
  "Statement": [
    {
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::zayjar-media/*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-server-side-encryption": "aws:kms"
        }
      }
    }
  ]
}
```

---

## 4. RDS Encryption at Rest

Amazon RDS encryption at rest is enabled by default for new instances using **AWS-managed keys (AES-256)**.

**Checklist:**
- Enable the `storageEncrypted` flag in Terraform/CloudFormation for all RDS instances.
- For Multi-AZ deployments, ensure encrypted read replicas inherit the KMS key from the primary.
- Enable encryption for automated backups and snapshots.

---

## 5. KMS Key Rotation Policies

| Key Type | Rotation Interval | Auto-Rotate | Notes |
|---|---|---|---|
| RDS encryption key | 365 days | Yes | AWS-managed, auto-rotates annually |
| S3 bucket key (SSE-KMS) | 365 days | Yes | Enable via KMS console |
| Application-level field encryption | N/A | Manual | Rotate when staff access changes |

**Procedure:**
1. Enable automatic annual rotation in the KMS console for all customer-managed keys.
2. Review key policies quarterly to ensure least-privilege access.
3. When decommissioning a service, schedule key deletion with the mandatory 7–30 day waiting period.

---

## 6. Application-Level Encryption Guidance

For sensitive fields requiring field-level encryption (e.g., payment tokens, PII):

| Data Type | Encryption Method | Storage |
|---|---|---|
| Payment tokens | AES-256-GCM via Stripe Vault | Stripe (never stored in DB) |
| Owner PII (phone, email) | Application-level AES-256-GCM | Encrypted column in PostgreSQL |
| API keys & secrets | AWS Secrets Manager / env vars | Never committed to source control |
| Session data | Redis TLS in transit | Redis (ephemeral, TTL-bounded) |

**Implementation pattern (field-level encryption):**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const key = Buffer.from(process.env.FIELD_ENCRYPTION_KEY, 'hex'); // 32 bytes

export function encryptField(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptField(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final('utf8');
}
```

**Rules:**
- Never store encryption keys in source code or environment variables committed to Git.
- Use AWS Secrets Manager or SSM Parameter Store (SecureString) for key distribution.
- Rotate field encryption keys at least annually or upon staff access changes.
- Audit all decryption events through structured logging.
