# Amrutam Telemedicine Backend API

> Production-ready, high-concurrency backend API foundation for the Amrutam Telemedicine platform. Built with Node.js LTS, Express 5, PostgreSQL, Prisma ORM, Zod, and Pino.

---

## 1. System Overview

Amrutam Telemedicine Backend provides a comprehensive, secure, and compliant digital healthcare platform:
- **Authentication & Security:** Dual-token JWT lifecycle (15-min access tokens, rotating refresh tokens with replay attack detection) and RFC 6238 TOTP Two-Factor Authentication (MFA) with atomic replay prevention.
- **Doctor Onboarding & Verification:** Dedicated public doctor application submission with strict clinical and personal field validation. Unverified practitioners are quarantined from patient search until verified by an Administrator.
- **Doctor Discovery:** Full-text directory search accelerated with PostgreSQL Trigram GIN indexing (`pg_trgm`) ensuring sub-55ms query latency across practitioner names, specializations, and qualifications.
- **Concurrency-Safe Availability & Booking:** Atomic slot reservation preventing double bookings under high concurrent traffic using PostgreSQL ACID serializable transactions and optional client idempotency keys.
- **Telemedicine Video Sessions:** WebRTC and Jitsi Meet provider adapters with short-lived session tokens, schedule window grace period enforcement, and automated duration calculation.
- **Secure Clinical Messaging:** Consultation-scoped messaging with private attachment storage, directory traversal prevention, and binary magic-byte validation (`PDF`, `JPEG`, `PNG`, `WEBP`).
- **Ayurvedic Prescriptions & PDF Streaming:** Dynamic digital prescription generation with tamper-evident PDF streaming rendered on-the-fly using PDFKit.
- **Financial Reliability & Automated Refunds:** Idempotent payment processing supporting Razorpay and Mock providers, HMAC-SHA256 webhook reconciliation, and partial-failure resilient automated refunds.
- **Durable Notifications:** PostgreSQL-backed asynchronous persistent queue (`NotificationQueueWorker`) supporting email, SMS, and in-app alerts with exponential backoff retries and crash recovery.
- **Compliance & Observability:** Platform-wide analytics, immutable HIPAA/clinical audit logs (`AuditLog`), structured logging with sensitive health data redaction, and sub-second health/readiness probes.

---

## 2. Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Runtime** | Node.js (v20+ LTS / v22 LTS) |
| **Modules** | ECMAScript Modules (`"type": "module"`) |
| **Web Framework** | Express.js 5 |
| **Database** | PostgreSQL 15+ / 16 (Render Managed PostgreSQL supported) |
| **ORM & Migrations** | Prisma ORM 6 |
| **Input Validation** | Zod (strict schema validation with custom regex rules) |
| **Logging** | Pino & Pino-HTTP (with automated PII and clinical data redaction) |
| **PDF Engine** | PDFKit |
| **Testing** | Vitest & Supertest (207 automated tests across 21 test suites) |
| **Documentation** | OpenAPI 3.0.3 & Swagger UI (`/api-docs`) |
| **Code Quality** | ESLint 10 (Flat config) |
| **Deployment** | Native Render Blueprint (`render.yaml`) & Vercel (`vercel.json`) |

---

## 3. Prerequisites

Ensure the following tools are installed on your environment:
- **Node.js:** v20.x or v22.x LTS (`node -v`)
- **npm:** v10+ (`npm -v`)
- **PostgreSQL:** A running PostgreSQL instance (local or cloud-hosted such as Render, Supabase, Neon, or AWS RDS).
- **Git:** Installed and configured.

---

## 4. Step-by-Step Setup Guide

### Step 1: Clone the Repository
```bash
git clone <repository-url>
cd telemedicine-backend
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Copy the template configuration file:
```bash
cp .env.example .env
```

Open `.env` and configure your credentials. At minimum, provide:
```env
# Server Configuration
NODE_ENV=development
PORT=5000
CORS_ORIGIN="http://localhost:3000"
LOG_LEVEL="info"

# PostgreSQL Database Connection
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/amrutam_telemedicine?schema=public"

# Cryptographic Secrets (minimum 32 random characters each)
JWT_ACCESS_SECRET="your-super-secret-random-32-char-access-key-here"
JWT_REFRESH_SECRET="your-super-secret-random-32-char-refresh-key-here"
MFA_ENCRYPTION_KEY="your-super-secret-random-32-char-mfa-key-here"
VIDEO_JWT_SECRET="your-super-secret-random-32-char-video-key-here"

# Feature Flags
ENABLE_IN_PROCESS_WORKER=true
STORAGE_DIR="storage/secure_attachments"
```

### Step 4: Validate Environment Configuration
Execute the built-in diagnostic checker to verify environment variables, cryptographic key lengths, and database connectivity:
```bash
npm run env:check
```

### Step 5: Run Database Migrations & Generate Prisma Client
Apply the version-controlled Prisma migrations (including table creation and GIN trigram indexes):
```bash
# Generate Prisma Client
npm run prisma:generate

# Apply database schema migrations
npm run prisma:migrate
```

### Step 6: Seed Demo Database Records
Populate fictional demo records (Super Admin, verified and unverified Doctors, Patients, Availability Slots, and Sample Consultations):
```bash
npm run prisma:seed
```

---

## 5. Running the Application

### Development Mode (with hot-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Standalone Background Worker
In distributed or multi-replica environments where `ENABLE_IN_PROCESS_WORKER=false`, run the dedicated notification queue worker in its own process:
```bash
npm run worker
```

Once started, the application exposes:
- **Base Endpoint:** `http://localhost:5000/`
- **Interactive Swagger UI:** `http://localhost:5000/api-docs/`
- **Liveness Probe:** `http://localhost:5000/api/v1/health`
- **Readiness Probe:** `http://localhost:5000/api/v1/ready`
- **Observability Metrics:** `http://localhost:5000/api/v1/metrics`

---

## 6. Cloud Deployment

### 1-Click Deployment on Render (Recommended)
This repository includes a native [render.yaml](render.yaml) Blueprint:
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** ➔ **Blueprint**.
3. Select your repository: `telemedicine-backend`.
4. Render automatically configures:
   - Web Service (`amrutam-telemedicine-api`)
   - Persistent Disk Mount (`/data/secure_attachments`)
   - Managed PostgreSQL Database with automatic connection strings
   - Background Notification Worker (`amrutam-notification-worker`)
5. Click **Apply**.

### Manual Web Service Configuration
- **Build Command:** `npm install && npx prisma generate && npx prisma migrate deploy`
- **Start Command:** `npm start`
- **Health Check Path:** `/api/v1/health`

---

## 7. Doctor Onboarding & Administrative Verification Workflow

To guarantee patient safety, practitioner registration enforces a two-phase onboarding workflow:

```
[ Doctor Applicant ]
        │
        ▼ (POST /api/v1/auth/doctor/register)
  Account created with isVerified: false
        │
        ▼ (Quarantined: Excluded from public search & cannot be booked)
[ Platform Administrator ]
        │
        ▼ (GET /api/v1/admin/doctors?isVerified=false)
  Inspects license, credentials, experience & documents
        │
        ▼ (PATCH /api/v1/admin/doctors/:id/verify)
  Approved (isVerified: true) + Immutable AuditLog entry recorded
        │
        ▼
  Active & Discoverable in Public Directory (GET /api/v1/doctors)
```

### 1. Doctor Registration
- **Endpoint:** `POST /api/v1/auth/doctor/register`
- **Access:** Public
- **Validation Constraints:**
  - `firstName` & `lastName`: Minimum 2 characters, alphabetic characters only (`^[a-zA-Z\s'-]+$`).
  - `email`: Valid email format, lowercase, unique across users.
  - `phone`: Exactly 10 digits (`^[0-9]{10}$`), unique across profiles.
  - `password`: Minimum 8 characters, requiring at least 1 uppercase, 1 lowercase, 1 digit, and 1 special symbol.
  - `licenseNumber`: 4–50 characters, unique across doctor profiles.
  - `specialization`: Minimum 2 characters.
  - `experienceYears`: Integer $\ge 0$.
  - `consultationFee`: Non-negative decimal $\ge 0$.

**Sample Request Body:**
```json
{
  "firstName": "Ananya",
  "lastName": "Sharma",
  "email": "dr.ananya@amrutam.co.in",
  "phone": "9876543210",
  "password": "SecurePassword123!",
  "licenseNumber": "AYUR-MED-2024-888",
  "specialization": "Ayurvedic Medicine & Panchakarma",
  "experienceYears": 8,
  "consultationFee": 750,
  "qualification": "BAMS, MD (Ayurveda)",
  "bio": "Specialist in classical Ayurvedic diagnosis and chronic disease management."
}
```

### 2. Administrative Inspection
- **Endpoint:** `GET /api/v1/admin/doctors`
- **Access:** `ADMIN` role required (`Bearer <accessToken>`)
- **Query Parameters:** `isVerified` (`'false'`, `'true'`, `'all'`), `search` (name, license, email, phone), `page`, `limit`.
- **Response:** Returns summary totals (`total`, `verified`, `pending`), doctor application items, and pagination metadata.

### 3. Verification & Activation
- **Endpoint:** `PATCH /api/v1/admin/doctors/:id/verify`
- **Access:** `ADMIN` role required (`Bearer <accessToken>`)
- **Action:** Sets `isVerified: true` (or `false` to revoke) and logs an immutable audit event (`DOCTOR_VERIFIED` or `DOCTOR_VERIFICATION_REVOKED`).

---

## 8. Two-Factor Authentication (TOTP MFA / 2FA)

Compatible with Google Authenticator, Microsoft Authenticator, and Authy:

1. **Initiate Enrollment (`POST /api/v1/auth/mfa/setup`):** Returns Base32 secret and `otpauth://` URI.
2. **Obtain 6-Digit Code:**
   - **CLI (Testing):** `npm run mfa:code <YOUR_SECRET>`
   - **Authenticator App:** Scan QR code or enter setup key.
3. **Verify & Activate (`POST /api/v1/auth/mfa/verify`):** Submit `{ "secret": "...", "code": "123456" }`.
4. **Log In with MFA (`POST /api/v1/auth/login`):** If MFA is active, receives `mfaSessionToken`, then submit `POST /api/v1/auth/mfa/login` with your 6-digit code.

For complete cURL instructions, refer to the [MFA Setup Guide](docs/mfa-setup-guide.md).

---

## 9. Interactive API Documentation (Swagger UI)

Interactive Swagger UI documentation is available at:
- **URL:** `http://localhost:5000/api-docs/` (or your production domain `/api-docs/`)
- **Source Specification:** [docs/api-spec.yaml](docs/api-spec.yaml) (OpenAPI 3.0.3)

### Core Endpoints Summary

| Category | Endpoint | Method | Access | Description |
| :--- | :--- | :---: | :---: | :--- |
| **System** | `/api/v1/health` | GET | Public | Process liveness health check |
| | `/api/v1/ready` | GET | Public | PostgreSQL readiness probe |
| | `/api/v1/metrics` | GET | Public | Observability & latency telemetry |
| **Auth** | `/api/v1/auth/register` | POST | Public | Patient registration |
| | `/api/v1/auth/doctor/register` | POST | Public | Doctor application submission (pending approval) |
| | `/api/v1/auth/login` | POST | Public | Credential verification & session initialization |
| | `/api/v1/auth/mfa/login` | POST | Public | MFA two-step challenge verification |
| | `/api/v1/auth/refresh` | POST | Public | Dual-token refresh rotation |
| **Doctors** | `/api/v1/doctors` | GET | Public | Trigram GIN-indexed doctor directory search |
| | `/api/v1/doctors/:id` | GET | Public | Practitioner profile details |
| | `/api/v1/doctors/profile` | PATCH | Doctor | Update own clinical profile |
| **Availability**| `/api/v1/availability/doctors/:id/slots` | GET | Public | View available appointment slots |
| | `/api/v1/availability/slots` | POST | Doctor | Batch create consultation slots |
| **Consultations**| `/api/v1/consultations/book` | POST | Patient | Atomic, concurrency-safe appointment booking |
| | `/api/v1/consultations/my-consultations` | GET | Auth | Paginated user consultation history |
| | `/api/v1/consultations/:id/cancel` | POST | Auth | Cancel appointment and recycle slot |
| **Video** | `/api/v1/video/sessions/:id/join` | POST | Participant | Generate short-lived video room session token |
| | `/api/v1/video/sessions/:id/end` | POST | Doctor/Admin | Terminate video room & record duration |
| **Messaging** | `/api/v1/consultations/:id/messages` | POST/GET | Participant | In-consultation chat & attachment exchange |
| **Prescriptions**| `/api/v1/prescriptions` | POST | Doctor | Issue digital Ayurvedic prescription |
| | `/api/v1/prescriptions/:id/pdf` | GET | Participant | Download tamper-evident clinical PDF |
| **Payments** | `/api/v1/payments/initiate` | POST | Patient | Create payment order intent |
| | `/api/v1/payments/webhook` | POST | Public | HMAC-SHA256 verified webhook reconciliation |
| | `/api/v1/payments/:id/refund` | POST | Admin | Idempotent automated refund workflow |
| **Admin** | `/api/v1/admin/doctors` | GET | Admin | List doctor applications & review status |
| | `/api/v1/admin/doctors/:id/verify` | PATCH | Admin | Approve or revoke doctor license |
| | `/api/v1/admin/analytics` | GET | Admin | Platform-wide operational analytics |
| | `/api/v1/admin/audit-logs` | GET | Admin | Immutable compliance audit trail queries |

---

## 10. Testing & Code Quality

### Automated Tests (Vitest)
Executes all 21 test suites verifying authentication, concurrency booking locks, video tokens, file magic bytes, refunds, and doctor onboarding:
```bash
npm test
```

### Performance & Load Benchmark
Runs high-concurrency benchmarks validating sub-55ms p95 doctor search latency:
```bash
npm run test:perf
```

### Static Code Analysis (ESLint)
```bash
npm run lint
```

Automatically fix lint formatting:
```bash
npm run lint:fix
```

---

## 11. Project Architecture & Documentation

Detailed architecture specifications, database schemas, and compliance reports are available in [`docs/`](docs/):
- **[Architecture Guide](docs/architecture.md):** Architectural tiers, high-concurrency design, GIN indexing strategy, and background workers.
- **[OpenAPI Specification](docs/api-spec.yaml):** Full OpenAPI 3.0 specification for all 47 endpoints.
- **[Database Design](docs/database-design.md):** Relational schema diagrams, constraints, and index definitions.
- **[Booking Concurrency Sequence](docs/booking-sequence.md):** Concurrency lock flow diagram.
- **[Security Checklist](docs/security-checklist.md):** Application security controls, data protection, and operational safeguards.
- **[Threat Model](docs/threat-model.md):** STRIDE threat assessment and countermeasures.
- **[Cloud Deployment Guide](docs/deployment.md):** Production runbooks for Render and Vercel.
- **[API Verification Report](docs/api-verification-report.md):** Audit test execution logs and verification sign-off.
