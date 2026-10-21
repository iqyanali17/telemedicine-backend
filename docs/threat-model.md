# Threat Model — Amrutam Telemedicine Backend

This document applies the **STRIDE** methodology (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) to analyze threat vectors for the Amrutam Telemedicine API and details the implemented and planned security countermeasures.

---

## 1. Asset Classification & Sensitivity

| Asset | Classification | Description |
|---|---|---|
| User Credentials | Critical | Password hashes, JWT secrets, refresh tokens |
| Clinical Data | High (HIPAA/DISHA Equivalent) | Medical prescriptions, diagnosis notes, patient health records |
| Identity Data | Medium | Full names, email addresses, phone numbers, gender |
| Availability Slots | Low | Doctor schedule intervals |
| System Logs & Metrics | Medium | Access logs, error traces, infrastructure telemetry |

---

## 2. STRIDE Threat Analysis & Mitigations

### 2.1 Spoofing (Identity Forgery)
- **Threat Vector**: An attacker crafts forged JWT tokens or steals expired tokens to impersonate a doctor or administrator.
- **Implemented Countermeasures**:
  - Cryptographic token signing with HS256 and high-entropy secrets (`JWT_ACCESS_SECRET` min 32 chars in production).
  - Short-lived access tokens (default 15 minutes).
  - Refresh token rotation and cryptographic hashing (`tokenHash` stored in database).
  - Native RFC 6238 TOTP engine with AES-256-GCM secret encryption and atomic counter replay protection preventing concurrent code reuse.

### 2.2 Tampering (Data Modification)
- **Threat Vector**: A malicious patient attempts to alter consultation fees, modify prescription diagnosis, or book slots assigned to other patients.
- **Implemented Countermeasures**:
  - Consultation fee is derived from the verified `DoctorProfile` in the database, never trusted from client request bodies.
  - Strict input validation via Zod schemas on every write route.
  - Database-level unique constraints and parameterized Prisma queries prevent SQL tampering.

### 2.3 Repudiation (Denial of Actions)
- **Threat Vector**: A doctor denies issuing a prescription, or a patient denies cancelling an appointment.
- **Implemented Countermeasures**:
  - Dedicated `audit_logs` table records every critical action (`action`, `userId`, `entityType`, `entityId`, `ipAddress`, `userAgent`, timestamp).
  - `consultationNumber` and `transactionRef` provide immutable transaction references.

### 2.4 Information Disclosure (Data Leaks)
- **Threat Vector**: Attackers inspect API error stacks or intercept traffic to view sensitive patient diagnoses.
- **Implemented Countermeasures**:
  - Error middleware suppresses stack traces in non-development environments (`NODE_ENV !== 'development'`).
  - Pino logger actively redacts sensitive fields: `password`, `passwordHash`, `token`, `accessToken`, `refreshToken`, `medicines`, `diagnosis`.
  - Database connection strings are never returned in health or readiness responses.
  - Object-level authorization prevents patients from querying other patients' prescriptions or records.

### 2.5 Denial of Service (DoS)
- **Threat Vector**: Automated bots attempt credential-stuffing attacks on `/auth/login` or flood booking endpoints to lock up availability slots.
- **Implemented Countermeasures**:
  - IP-based rate limiting via `express-rate-limit` (default 100 requests per 15-minute window).
  - JSON body payload size restricted to 1MB (`express.json({ limit: '1mb' })`).
  - Database connection limits configured to prevent connection pool exhaustion.

### 2.6 Elevation of Privilege
- **Threat Vector**: A patient modifies request headers to call `/api/v1/admin/analytics` or `/api/v1/availability` creation.
- **Implemented Countermeasures**:
  - Two-stage middleware architecture: `authenticate` validates cryptographically verified role from JWT claims; `authorize(...roles)` enforces RBAC.
  - Administrative routes explicitly require the `ADMIN` role.
  - Doctor slot creation explicitly requires the `DOCTOR` role.
