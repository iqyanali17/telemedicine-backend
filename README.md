# Amrutam Telemedicine Backend API Foundation

> Secure, modular, production-ready backend API foundation for the Amrutam Telemedicine platform. Built with Node.js LTS, Express.js (ES modules), PostgreSQL, Prisma ORM, Zod, and Pino.

---

## 1. Technology Stack

- **Runtime:** Node.js (v20+ LTS / v22 LTS)
- **Language & Modules:** JavaScript with ECMAScript Modules (`"type": "module"`)
- **HTTP Framework:** Express.js 5
- **Database:** PostgreSQL (locally installed or managed cloud service)
- **ORM & Migrations:** Prisma ORM 6
- **Schema & Input Validation:** Zod
- **Structured Logging:** Pino & Pino-HTTP (with sensitive health data redaction)
- **Unit & Integration Testing:** Vitest & Supertest
- **API Documentation:** OpenAPI 3.0.3 & Swagger UI (`/api-docs`)
- **Code Quality:** ESLint 10 (Flat config)
- **Continuous Integration:** GitHub Actions

---

## 2. Directory Structure

```
amrutam-backend/
├── prisma/
│   ├── schema.prisma              # Data models, enums & relational constraints
│   ├── migrations/                # Version-controlled schema migrations
│   └── seed.js                    # Fictional development database seeder
│
├── src/
│   ├── app.js                     # Express app setup, security headers & middleware
│   ├── server.js                  # Server listener & graceful shutdown coordinator
│   ├── worker.js                  # Standalone background notification worker daemon
│   │
│   ├── config/
│   │   ├── env.js                 # Strict Zod environment variable validation
│   │   ├── database.js            # PrismaClient singleton & safe readiness check
│   │   └── logger.js              # Pino structured logger with data redaction
│   │
│   ├── routes/
│   │   └── index.js               # Central routing, health & readiness registration
│   │
│   ├── modules/
│   │   ├── auth/                  # Authentication, JWT issuance & verification
│   │   ├── users/                 # User & patient profile management
│   │   ├── doctors/               # Doctor profiles & directory search
│   │   ├── availability/          # Slot scheduling & query
│   │   ├── consultations/         # Idempotent, concurrency-safe booking
│   │   ├── prescriptions/         # Doctor prescription issuance & patient access
│   │   ├── payments/              # Payment record tracking
│   │   └── admin/                 # Aggregated analytics & compliance audit logs
│   │
│   ├── middleware/
│   │   ├── authenticate.js        # JWT Bearer token authentication
│   │   ├── authorize.js           # Role-based access control (RBAC)
│   │   ├── validate-request.js    # Zod schema request validation
│   │   ├── error-handler.js       # Centralized error handler
│   │   └── not-found.js           # 404 Not Found handler
│   │
│   ├── utils/
│   │   ├── api-error.js           # Standardized ApiError class
│   │   ├── api-response.js        # Standardized ApiResponse wrapper
│   │   └── async-handler.js       # Async controller wrapper
│   │
│   └── observability/
│       ├── request-logger.js      # Structured HTTP request logger
│       └── metrics.js             # Telemetry & latency tracking
│
├── tests/
│   ├── unit/                      # Unit tests (ApiError, ApiResponse, etc.)
│   ├── integration/               # Integration tests (Health, Auth, Error handling)
│   ├── fixtures/                  # Test data fixtures
│   └── helpers/                   # Test client & utilities
│
├── docs/
│   ├── architecture.md            # System architecture & scalability design
│   ├── api-spec.yaml              # Complete OpenAPI 3.0.3 specification
│   ├── database-design.md         # ER diagram, table schemas & index strategy
│   ├── booking-sequence.md        # Concurrency & double-booking sequence diagram
│   ├── threat-model.md            # STRIDE security analysis & countermeasures
│   ├── security-checklist.md      # Actionable security checklist
│   └── deployment.md              # Cloud deployment & migration instructions
│
├── scripts/
│   └── check-environment.js       # Diagnostic environment verification script
│
├── .github/workflows/ci.yml       # GitHub Actions CI matrix workflow
├── .env.example                   # Sample environment configuration
├── .gitignore                     # Git ignore rules
├── .nvmrc                         # Node version lock
├── eslint.config.js               # ESLint flat configuration
├── vitest.config.js               # Vitest configuration & test environment
└── package.json                   # Project scripts and dependencies
```

---

## 3. Prerequisites

Before running the application locally, ensure you have:
1. **Node.js**: v20 LTS or v22 LTS (`node -v`)
2. **npm**: v10+ (`npm -v`)
3. **PostgreSQL**: A running PostgreSQL instance (locally or cloud-hosted).
4. **Git**: Installed and initialized.

---

## 4. Local Setup Step-by-Step

### 1. Clone & Install Dependencies
```bash
git clone <repository-url>
cd amrutam-backend
npm install
```

### 2. Configure Environment Variables
Copy the template configuration file:
```bash
cp .env.example .env
```

Edit `.env` with your local PostgreSQL credentials:
```env
NODE_ENV=development
PORT=5000
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/amrutam_telemedicine?schema=public"
JWT_ACCESS_SECRET="your-super-secret-random-32-character-access-key"
JWT_REFRESH_SECRET="your-super-secret-random-32-character-refresh-key"
CORS_ORIGIN="http://localhost:3000"
LOG_LEVEL="info"
```

### 3. Verify Environment Configuration
Run the built-in diagnostic script to inspect your runtime and database connectivity:
```bash
npm run env:check
```

### 4. Database Setup & Prisma Migrations
When your PostgreSQL service is running and accessible:
```bash
# Generate Prisma Client
npm run prisma:generate

# Run development migrations to create tables and relations
npm run prisma:migrate

# Seed fictional development demo records (Admin, Doctor, Patient)
npm run prisma:seed
```

---

## 5. Running the Application

### Development Mode (with hot-reload watch)
```bash
npm run dev
```

### Production Mode (e.g. Render / Production Server)
```bash
npm start
```

### Deploying to Render (Recommended)
1. Push this repository to GitHub or GitLab.
2. In the [Render Dashboard](https://dashboard.render.com), select **New** ➔ **Blueprint**.
3. Link your repository. Render reads [`render.yaml`](file:///c:/telemedicine-backend/render.yaml) and automatically provisions both the Web Service and Managed PostgreSQL Database with zero manual configuration.
4. Alternatively, create a **Web Service** manually:
   - **Build Command:** `npm install && npx prisma generate && npx prisma migrate deploy`
   - **Start Command:** `node src/server.js`
   - **Health Check Path:** `/api/v1/health`

### Deploying to Vercel
1. Import the repository in Vercel.
2. Vercel automatically detects [`vercel.json`](file:///c:/telemedicine-backend/vercel.json).
3. Set your `DATABASE_URL` in Environment Variables and set the build command to `npx prisma generate && npx prisma migrate deploy`.

Once running, the API will be available at:
- **Base Endpoint:** `http://localhost:5000/`
- **Interactive API Documentation:** `http://localhost:5000/api-docs`
- **Liveness Health Check:** `http://localhost:5000/api/v1/health`
- **Database Readiness Probe:** `http://localhost:5000/api/v1/ready`
- **Observability Metrics:** `http://localhost:5000/api/v1/metrics`

---

## 6. Testing & Quality Assurance

### Run Automated Tests (Vitest)
```bash
npm test
```

### Run Performance & Load Benchmark
```bash
npm run test:perf
```

### Run Code Quality & Linter Checks (ESLint)
```bash
npm run lint
```

### Automatically Fix Lint Formatting
```bash
npm run lint:fix
```

---

## 7. Health & Readiness Probes

- `GET /api/v1/health`: Returns HTTP 200 indicating the Node.js application process is healthy and active.
- `GET /api/v1/ready`: Validates that PostgreSQL is connected and responsive (`SELECT 1`). If the database is unreachable, returns HTTP 503 without exposing credentials.
- `GET /api/v1/metrics`: Returns in-memory latency percentiles (p50, p95, p99), active connections, request breakdown, and heap usage.

---

## 8. Two-Step Verification (MFA / 2FA) Setup & Verification

The platform implements RFC 6238 Time-based One-Time Password (TOTP) two-step verification compatible with Google Authenticator, Microsoft Authenticator, and Authy:

1. **Initiate Enrollment:** Call `POST /api/v1/auth/mfa/setup` (with `Bearer <accessToken>`) to receive your unique Base32 `secret` and `otpauth://` URI.
2. **Generate 6-Digit Code:**
   - **CLI (Fastest):** Run `npm run mfa:code <YOUR_SECRET>`
   - **Smartphone App:** Add account in Google Authenticator -> *Enter a setup key* -> paste `secret` -> read 6-digit code.
3. **Verify & Activate:** Call `POST /api/v1/auth/mfa/verify` with `{"secret": "...", "code": "..."}`.
4. **Log In with MFA:** When logging in at `POST /api/v1/auth/login`, receive `mfaSessionToken`, then submit `POST /api/v1/auth/mfa/login` with your 6-digit code.

For complete cURL commands and troubleshooting, see the [MFA Setup Guide](docs/mfa-setup-guide.md).

---

## 9. Development Roadmap

- **Phase 1 (Complete):** Backend foundation, modular folder structure, Prisma schema, security middleware, environment validation, logging, health probes, test suites, OpenAPI specification, and CI workflow.
- **Phase 2 (Complete):** Core workflows fully implemented and tested (Doctor directory search, consultation lifecycle, PDF prescription streaming, payments, and admin analytics).
- **Phase 3.1 (Complete):** Verification audit remediation and production hardening (HMAC payment webhooks, slot recycling resolution, PATIENT-only registration lockdown, prescription eligibility checks, refresh token persistence verification, and doctor name sorting).
- **Phase 3.2 (Complete):** Telemedicine video consultation sessions:
  - Secure room initialization & participant token issuance supporting WebRTC and Jitsi Meet adapters.
  - Granular object-level authorization (IDOR/BOLA prevention) restricting room access to assigned patient, doctor, and admin.
  - Scheduled time window enforcement with configurable pre-session and post-session grace buffers.
  - Consultation status advancement on doctor join (`SCHEDULED` ➔ `IN_PROGRESS`).
  - Doctor room moderation and termination with automatic duration calculation (`durationSeconds`).
- **Phase 3.3 (Complete):** Secure clinical messaging and attachments:
  - Participant-restricted real-time asynchronous consultation messaging and read receipts (`isRead`, `readAt`).
  - Private attachment storage (`storage/secure_attachments`) with directory traversal sanitization.
  - Binary magic byte validation (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`).
  - Streamed binary downloads with secure `Content-Disposition`.
- **Phase 3.4 (Complete):** Payment reliability and financial reconciliation:
  - Pluggable `BasePaymentGateway` and `MockPaymentGateway` abstraction.
  - Automated refund workflow (`POST /payments/:consultationId/refund`) that reimburses payment, cancels consultation, and frees the booked slot back to `AVAILABLE`.
  - Admin financial reconciliation reporting (`GET /payments/reconciliation`) with gross, net revenue, refund aggregates, and discrepancy auditing.
- **Phase 3.5 (Complete):** Asynchronous notifications and background processing:
  - Multi-channel notification providers (`EmailChannel`, `SmsChannel`, In-App alerts).
  - Non-blocking `NotificationDispatcher` for booking confirmations, cancellations, prescriptions, and refunds.
  - Background reminder runner (`POST /notifications/dispatch-reminders`) with duplicate-prevention guards.
- **Phase 3.6 (Complete):** Security hardening, TOTP MFA and token lifecycle protection:
  - Native RFC 6238 TOTP engine with RFC 4648 Base32 support (zero third-party dependencies).
  - Two-step login challenge (`POST /auth/login` ➔ `POST /auth/mfa/login`).
  - Single-use refresh token rotation with immediate reuse/replay attack breach detection.
- **Phase 3.7 (Complete):** Performance, observability and deployment readiness:
  - High-throughput load benchmark script (`npm run test:perf`) measuring p50, p95, and p99 response times.
  - Comprehensive deployment documentation and operational runbooks in `docs/`.
- **Final Hardening Sprint (Complete):**
  - **Task 1: Durable Notification Queue:** Replaced transient in-memory scheduling with a durable PostgreSQL-backed queue (`NotificationQueueWorker`). Implemented atomic row locking (`PENDING` ➔ `PROCESSING`), exponential backoff retries (`nextRetryAt`), stalled job crash recovery (`recoverStalledJobs()`), and guaranteed persistence across worker/server restarts.
  - **Task 2: Refund Recovery & Partial Failure Safety:** Implemented durable `RefundOperation` state machine with provider-supported idempotency keys. Explicitly handles partial failure where the payment provider succeeds but the database transaction stalls or commits late, reusing existing `refundRef` without ever issuing duplicate refunds. Includes automatic incomplete-operation reconciliation (`reconcileIncompleteRefunds`).
  - **Task 3: TOTP Replay Prevention & Atomic Concurrency Defense:** Monotonic atomic time-step tracking (`lastTotpCounter`) preventing replay of the same 6-digit TOTP code within its valid time window. Defends against concurrent race-condition verification attempts using atomic Prisma conditional updates (`OR: [{ lastTotpCounter: null }, { lastTotpCounter: { lt: matchedCounter } }]`).
  - **Task 4: External Integration Readiness:** Clear architectural separation between mock adapters and real external providers (`RazorpayGateway`, SMTP email, Twilio SMS, Jitsi video). Strict credential validation with fail-fast configuration checks and complete `.env.example` templates.
  - **Task 5: Production Operations & Cloud Deployment Readiness:** Native Render Blueprint configuration (`render.yaml`) for automated 1-click deployment with managed PostgreSQL, persistent disk storage for attachments (`/data/secure_attachments`), Vercel support (`vercel.json`), and configurable load benchmarking (`scripts/load-benchmark.js`).
  - **Task 6: Query Acceleration & Trigram GIN Indexing:** Enabled PostgreSQL `pg_trgm` extension and created 5 GIN trigram indexes on `doctor_profiles` and `profiles`, delivering sub-55ms p95 doctor directory search latency.
  - **184 automated unit and integration tests passing across 20 test files with 0 ESLint errors and warnings.**

