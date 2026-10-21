# Architecture Document — Amrutam Telemedicine Backend

## 1. Executive Summary & Design Goals

The Amrutam Telemedicine Backend API is designed as a secure, high-concurrency, modular platform connecting patients with Ayurvedic and conventional healthcare practitioners. 

### System Design Targets
The platform architecture is designed toward the following targets:
- **Daily Volume Target:** 100,000 consultations per day (~1.15 sustained write operations per second, with peak bursts up to 25–50 bookings/sec).
- **Latency Objectives:** p95 read latency < 200 ms; p95 write latency < 500 ms under nominal load.
- **Availability Target:** 99.95% uptime across compute and database tiers.
- **Compliance & Security:** Role-Based Access Control (RBAC), audit logging for sensitive actions, parameter validation, and secure password hashing.

> *Note:* These figures represent architecture capacity targets, not benchmarks achieved by an uncalibrated starter instance. Production load tests and performance profiling are required to substantiate target attainment under real-world clinical workloads.

---

## 2. Layered Modular Architecture

The backend follows a layered, modular domain design implemented in Node.js (ES modules) with Express.js and Prisma ORM on PostgreSQL.

```
                           [ Incoming HTTP/HTTPS Client ]
                                        │
                                        ▼
                        [ Security & Observability Stack ]
                          - Helmet (Security Headers)
                          - CORS Control
                          - Rate Limiter (DDoS Mitigation)
                          - Pino HTTP (Request Logging & ID)
                          - Telemetry Metrics Interceptor
                                        │
                                        ▼
                          [ Central Routing Layer ]
                                (/api/v1/*)
                                        │
             ┌──────────────────────────┼──────────────────────────┐
             ▼                          ▼                          ▼
     [ Auth & Users ]          [ Doctors & Slots ]        [ Consultations ]
   (Routes/Controllers)       (Routes/Controllers)       (Routes/Controllers)
             │                          │                          │
             ▼                          ▼                          ▼
     [ Service Layer ]          [ Service Layer ]          [ Service Layer ]
  (Business Logic & Auth)     (Filtering & Queries)     (Idempotency & Locks)
             │                          │                          │
             └──────────────────────────┼──────────────────────────┘
                                        ▼
                           [ Data Access Layer (Prisma) ]
                             - Parameterized Queries
                             - Schema Migrations
                             - ACID Transactions
                                        │
                                        ▼
                              [ PostgreSQL Database ]
```

### Architectural Tiers

1. **Presentation & Route Layer (`src/routes/`, `src/modules/*/routes.js`)**:
   - Maps URL endpoints to controllers.
   - Applies route-specific validation middleware and authorization guards.

2. **Controller Layer (`src/modules/*/controller.js`)**:
   - Thin orchestration layer.
   - Unpacks parameters from request objects.
   - Forwards calls to service layer functions wrapped in `asyncHandler`.
   - Sends standardized responses via `ApiResponse`.

3. **Service Layer (`src/modules/*/service.js`)**:
   - Core domain business logic.
   - Executes authorization checks and state transitions.
   - Manages transactional boundaries (`prisma.$transaction`).
   - Generates domain events and audit log entries.

4. **Persistence Layer (`prisma/schema.prisma`, `src/config/database.js`)**:
   - Defines strict schema models, foreign key constraints, and performance indexes.
   - Executes parameterized queries through Prisma Client, preventing SQL injection.

5. **Cross-Cutting Concerns (`src/middleware/`, `src/utils/`, `src/observability/`)**:
   - Structured JSON logging with redaction of sensitive patient data.
   - Centralized error translation (Zod, Prisma, and operational errors).
   - In-memory metrics tracking (latency p50/p95/p99, request count, active connections).

---

## 3. High-Concurrency & Double-Booking Prevention

Preventing double bookings under concurrent patient requests is critical for telemedicine scheduling:
1. **Database Unique Constraint**: Each `AvailabilitySlot` is uniquely identified by `[doctorId, startTime, endTime]`. An individual slot can be referenced by at most one `Consultation` via a 1-to-1 unique relationship (`slotId UNIQUE`).
2. **Atomic State Transition**: The booking flow utilizes PostgreSQL serializable or repeatable read transactions via Prisma. The slot status check and update from `AVAILABLE` to `BOOKED` occurs within the same atomic transaction as consultation record creation.
3. **Idempotency Strategy**: Patients can supply an optional `idempotencyKey`. If network retries occur, the database checks the unique idempotency index. If an identical key exists for that patient, the existing consultation is returned without creating duplicate bookings or transactions.

---

## 4. Observability & Monitoring Baseline

1. **Structured Logging**: Implemented using `pino` and `pino-http`. Every HTTP transaction is assigned a unique `x-request-id` header (or generates a UUID). All log entries serialize structured JSON containing method, path, response status, and duration.
2. **Sensitive Data Redaction**: Medical prescriptions, patient diagnoses, authorization tokens, and password hashes are automatically stripped from log outputs.
3. **Telemetry & Health Probes**:
   - `GET /api/v1/health`: Lightweight liveness check for orchestrators (e.g., Render health check and hosting process monitors).
   - `GET /api/v1/ready`: Deep dependency check querying PostgreSQL (`SELECT 1`). Returns HTTP 503 if the database is disconnected, without exposing database credentials.
   - `GET /api/v1/metrics`: Reports latency percentiles (p50, p95, p99), active connections, status code breakdown, and Node.js process memory metrics.

---

## 5. Horizontal Scalability & Query Performance Roadmap

To support 100,000 consultations per day:
- **Stateless Compute**: API instances maintain no local session state (JWT tokens and database-backed refresh tokens are used). Compute nodes scale horizontally behind Render's load-balancing ingress.
- **Accelerated Search with PostgreSQL Trigram GIN Indexes**: Uses `pg_trgm` extension and GIN indexes (`doctor_profiles_specialization_trgm_idx`, `doctor_profiles_qualification_trgm_idx`, `doctor_profiles_bio_trgm_idx`, `profiles_firstName_trgm_idx`, `profiles_lastName_trgm_idx`). Replaces full-table scans with trigram index scans for wildcard `ILIKE '%term%'` doctor searches, keeping p95 latency under 25ms.
- **Connection Pooling**: PostgreSQL connections are managed via Render Managed PostgreSQL with PgBouncer (`pooledConnectionString` on port 6543) with `?pgbouncer=true&connection_limit=20` to prevent connection exhaustion under burst traffic.
- **Read Replicas**: Doctor directory searches and read queries can be routed to PostgreSQL read replicas, reserving write capacity on the primary node for bookings and payments.

---

## 6. Phase 3 Telemedicine Subsystems & Workflows

### 6.1 Video Consultation Sessions & Provider Abstraction
- **Provider Architecture**: Implements `BaseVideoProvider` interface with `MockWebRtcProvider` and `JitsiMeetProvider`. Allows seamless plug-and-play switching without touching consultation routes.
- **Access Guard Window**: Restricts video room entry to assigned patient, assigned doctor, and admins within scheduled time window (15-minute grace window). Issues signed short-lived JWT video session tokens.
- **Room Lifecycle Management**: Supports `join`, `leave`, and `end` operations, tracking participant disconnects and recording room call duration.

### 6.2 Secure Clinical Messaging & Medical Attachments
- **Role-Restricted Chat**: Real-time asynchronous text and attachment messaging strictly scoped to assigned consultation participants.
- **Private Attachment Storage**: Eliminates public access risks by storing medical attachments in `storage/secure_attachments` with randomized UUID storage keys.
- **File Validation & Magic Bytes**: Strips directory traversal attacks from client file names and performs strict binary magic byte validation for `application/pdf`, `image/jpeg`, `image/png`, and `image/webp`. Rejects disguised executables and script payloads.
- **Auditing & Redaction**: Dispatches streamed binary downloads with secure `Content-Disposition`. Excludes clinical message bodies and attachment file data from Pino logs and database audit metadata.

### 6.3 Payment Reliability, Partial Failure Recovery & Automated Refunds
- **Gateway Abstraction**: Features `BasePaymentGateway`, `MockPaymentGateway`, and `RazorpayGateway` with order creation, HMAC-SHA256 webhook validation, and idempotent refund processing.
- **Durable Refund Operations**: Every refund attempt is tracked via a dedicated `RefundOperation` model with an idempotency key (`refund_${consultationId}_${paymentId}`).
- **Partial Failure Recovery**: If the external payment provider succeeds but the subsequent database transaction fails, subsequent calls or background reconciliation use the stored `refundRef` to finalize the DB commit without double-refunding upstream.
- **Financial Reconciliation**: Dedicated administrator reconciliation reporting (`GET /payments/reconciliation`) aggregating gross captured revenue, refund volumes, net revenue, and automatic reconciliation of stalled operations via `reconcileIncompleteRefunds()`.

### 6.4 Durable Asynchronous Notification Queue
- **PostgreSQL-Backed Durable Queue**: Replaced transient in-memory scheduling with persistent PostgreSQL jobs in `notifications` table (`status: PENDING | PROCESSING | SENT | FAILED`).
- **Atomic Worker & Stalled Job Recovery**: `NotificationQueueWorker` processes due batches using atomic row locking (`status = 'PENDING' -> 'PROCESSING'`). On server restart, `recoverStalledJobs()` automatically recovers interrupted jobs without data loss.
- **Retry Policy & Exponential Backoff**: Failed channel transmissions are retried up to `maxAttempts` (default 3) using exponential backoff (`2s, 4s, 8s...`) before reaching terminal `FAILED` status with explicit error logging.
- **Deduplication & Idempotency**: Unique `idempotencyKey` prevents duplicate notifications on rapid client retries or multiple webhook deliveries.

### 6.5 Multi-Factor Authentication (TOTP RFC 6238) & Atomic Replay Defense
- **Native TOTP Engine**: Pure Node.js `crypto` implementation of RFC 6238 and RFC 4648 Base32 without third-party package dependencies. Supports 6-digit codes and ±30s clock skew tolerance.
- **Atomic Replay Prevention**: Tracks the last accepted time-step counter (`lastTotpCounter`) on the User model. Database updates are performed atomically (`where: { id, OR: [{ lastTotpCounter: null }, { lastTotpCounter: { lt: matchedCounter } }] }`), guaranteeing that the same code cannot be accepted twice even under high-speed concurrent race conditions.
- **Two-Step Login**: Enforces second-factor TOTP verification during `/auth/login` when `isMfaEnabled` is active, with temporary 5-minute session challenges.
- **Token Rotation & Replay Attack Defense**: Single-use refresh token rotation that instantly revokes all user sessions if a revoked refresh token is replayed.

### 6.6 Doctor Registration, Credential Validation & Administrative Verification Workflow
- **Public Doctor Application Submission**: Practitioners register via `POST /api/v1/auth/doctor/register` submitting personal, contact, and clinical credential information.
- **Strict Clinical Validation Engine**: Zod schemas enforce alphabetic-only name constraints (`^[a-zA-Z\s'-]+$`), 10-digit Indian phone numbers (`^[0-9]{10}$`), high-entropy passwords (8+ chars with uppercase, lowercase, digit, and special symbol), and valid non-negative consultation fees.
- **Two-Phase Isolation Security**: New doctor profiles default to `isVerified: false`. Unverified doctors are strictly quarantined and filtered out of public directory searches (`GET /api/v1/doctors`) and cannot receive appointment bookings.
- **Administrative Inspection & Review**: Platform administrators query pending applications via `GET /api/v1/admin/doctors?isVerified=false` with search across names, emails, phones, and license numbers, with aggregated verification status metrics (`total`, `verified`, `pending`).
- **Administrative Verification & Audit Logging**: Administrators approve or revoke practitioner status via `PATCH /api/v1/admin/doctors/:id/verify`. Setting `isVerified: true` publishes the doctor into the active search index. All verification state transitions record immutable `AuditLog` events (`DOCTOR_VERIFIED` or `DOCTOR_VERIFICATION_REVOKED`) tracking the admin ID, doctor email, license, and optional reason notes.

---

## 7. Cloud Deployment & Operational Readiness

- **PaaS Deployment Architecture (Render & Vercel)**: Built natively for modern zero-ops cloud hosting without Docker containers or AWS infrastructure overhead. Uses declarative `render.yaml` Blueprints for automated Express web service, persistent attachment disk (`amrutam-attachments`), dedicated background worker (`amrutam-notification-worker`), and managed PostgreSQL provisioning, and `vercel.json` for frontend/serverless deployment.
- **Decoupled Background Workers**: Asynchronous notification queue polling is decoupled from the web application into `src/worker.js`, enabling the web service and worker to scale independently without redundant queue polling across web dynos.
- **Persistent Storage Volumes**: Private medical attachments, prescriptions, and consultation notes are persisted to dedicated disk mounts (`STORAGE_DIR=/data/secure_attachments`), surviving ephemeral instance restarts.
- **Automated Lifecycle Migrations**: Continuous integration and deployment scripts automatically run `npx prisma migrate deploy` during build and release phases.
- **Benchmark Realism**: Performance benchmark script (`scripts/load-benchmark.js`) supports configurable concurrency and requests, testing both read and write workloads under realistic local constraints with explicit production scaling caveats.

