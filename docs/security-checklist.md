# Security Checklist — Amrutam Telemedicine Backend

This checklist tracks security controls implemented in the backend foundation alongside operational recommendations for production deployment.

---

## 1. Application-Level Security

- [x] **Secure HTTP Headers**: Configured `helmet` to set X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, and Content-Security-Policy.
- [x] **Strict Input Validation**: All route parameters, queries, and request bodies are validated using Zod schemas with sanitization and trimming.
- [x] **Structured Password Hashing**: Passwords are encrypted with bcryptjs using salt work factor >= 10.
- [x] **JWT Security**: Access tokens are signed using high-entropy secrets with short expiration (15m).
- [x] **Rate Limiting**: Request rate limiting configured across `/api/*` endpoints to defend against brute force and volumetric DoS.
- [x] **Payload Size Limits**: Incoming JSON bodies restricted to 1MB to prevent memory exhaustion attacks.
- [x] **CORS Origin Whitelisting**: Restricted to explicit domains configured via `CORS_ORIGIN` environment variable.
- [x] **Safe Error Serialization**: Sensitive server details, file system paths, and stack traces are suppressed in production mode.
- [x] **PII & Medical Redaction**: Structured logger (`pino`) automatically redacts passwords, tokens, medicines, and diagnostic strings.
- [x] **Multi-Factor Authentication (TOTP RFC 6238)**: Implemented native RFC 6238 TOTP with AES-256-GCM authenticated secret encryption and atomic replay prevention. See [MFA Setup Guide](mfa-setup-guide.md).

---

## 2. Database & Data Protection

- [x] **SQL Injection Defense**: Object Relational Mapping (Prisma) utilizes parameterized queries for all operations.
- [x] **Non-Hardcoded Secrets**: All database URLs and secrets are read strictly from runtime environment variables.
- [x] **Database Isolation in Tests**: Test suites operate against isolated test databases or mock connection configurations.
- [x] **Safe Readiness Reporting**: Database readiness probe reports connectivity status without leaking credentials or internal host addresses.
- [x] **Database Encryption at Rest**: Encrypted at rest via Render Managed PostgreSQL storage volumes (LUKS/AES-256 encryption).
- [ ] **Least-Privilege Database Role**: Configure distinct production application user without DDL / schema modification permissions.

---

## 3. Operations & Environment

- [x] **Git Secret Exclusion**: `.gitignore` strictly excludes `.env`, `*.log`, credentials, and temporary data.
- [x] **Dependency Scanning**: Clean dependencies with regular `npm audit` monitoring in CI.
- [x] **Graceful Process Shutdown**: Traps `SIGTERM` and `SIGINT` signals to flush pending requests and safely close database connections.
- [x] **Automated CI Validation**: GitHub Actions workflow verifies lint standards and executes automated tests on every push.
- [ ] **TLS/HTTPS Enforcement**: Terminate TLS at the load balancer / reverse proxy layer with TLS 1.3.
- [ ] **Automated Backup & Disaster Recovery**: Schedule daily automated snapshots with Point-In-Time-Recovery (PITR) at the database hosting provider.
