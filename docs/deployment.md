# Deployment Guide — Amrutam Telemedicine Backend (Render & Vercel)

This guide outlines deploying the Amrutam Telemedicine API to **Render** (recommended for Node.js Express + background queue worker) or **Vercel** paired with a managed PostgreSQL database.

---

## 1. Hosting Architecture Overview

```
 [ Client Apps / HTTPS ]
            │
            ▼
 [ Render Web Service / Vercel Serverless ] (TLS 1.3 Termination, Auto-Scaling)
            │ (Express.js API, Prisma ORM, Notification Queue Worker)
            ▼
 [ Render Managed PostgreSQL Database ]
            - Private Internal Networking (no public exposure)
            - Automated Daily Backups
            - Zero Docker maintenance
```

---

## 2. Option A: 1-Click Deployment via Render Blueprint (`render.yaml`)

The repository includes a ready-to-use [`render.yaml`](file:///c:/telemedicine-backend/render.yaml) specification that provisions both the **Web Service** and **PostgreSQL Database** automatically.

### Steps:
1. Push this repository to GitHub or GitLab.
2. In the [Render Dashboard](https://dashboard.render.com), click **New** ➔ **Blueprint**.
3. Select your repository.
4. Render will detect `render.yaml` and display:
   - **Service:** `amrutam-telemedicine-api` (Web Service, Node runtime)
   - **Database:** `amrutam-postgres` (PostgreSQL 16)
5. Click **Apply**.
6. Render provisions the database, automatically injects the internal `DATABASE_URL`, generates secure secrets for JWT and webhooks, runs database migrations, and boots the application.

---

## 3. Option B: Manual Setup on Render

If you prefer configuring services manually via the Render dashboard:

### Step 1: Create a PostgreSQL Database on Render
1. In the Render Dashboard, click **New** ➔ **PostgreSQL**.
2. **Name**: `amrutam-postgres`
3. **Database**: `amrutam_telemedicine`
4. **User**: `amrutam`
5. **Region**: Choose the region closest to your users (e.g. `Oregon` or `Frankfurt`).
6. **Plan**: `Starter` (or `Free`).
7. Click **Create Database**.
8. Once provisioned, copy the **Internal Database URL** (e.g. `postgresql://amrutam:...@dpg-...-a/amrutam_telemedicine`).

### Step 2: Create the Web Service
1. In the Render Dashboard, click **New** ➔ **Web Service**.
2. Connect your repository.
3. Configure settings:
   - **Name**: `amrutam-telemedicine-api`
   - **Language**: `Node`
   - **Branch**: `main` (or `master`)
   - **Build Command**: `npm install && npx prisma generate && npx prisma migrate deploy`
   - **Start Command**: `node src/server.js`
   - **Health Check Path**: `/api/v1/health`
   - **Plan**: `Starter` (or `Free`)

### Step 3: Configure Environment Variables
Under the **Environment** tab of your Web Service, add:

| Key | Value / Instructions |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Paste the **Internal Database URL** from Step 1 |
| `JWT_ACCESS_SECRET` | 32+ character random secret (e.g. generated via `openssl rand -hex 32`) |
| `JWT_ACCESS_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_SECRET` | 32+ character random secret |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `CORS_ORIGIN` | Whitelisted frontend URL (e.g. `https://amrutam.co.in,https://app.amrutam.co.in`). *Wildcard `*` is blocked in production.* |
| `STORAGE_DIR` | Path to persistent storage disk (e.g. `/data/secure_attachments`) |
| `ENABLE_IN_PROCESS_WORKER` | `true` for single-instance, or `false` when using dedicated background worker |
| `LOG_LEVEL` | `info` |
| `PAYMENT_WEBHOOK_SECRET` | 32+ character random secret |
| `PAYMENT_PROVIDER` | `MOCK` (or `RAZORPAY` when live credentials are ready) |
| `VIDEO_PROVIDER` | `MOCK_WEBRTC` (or `JITSI` when live credentials are ready) |
| `VIDEO_JWT_SECRET` | 32+ character random secret |
| `MFA_ENCRYPTION_KEY` | 32+ character random secret |

### Step 4: Configure Persistent Storage Disk (Render)
To retain user-uploaded medical records, consultation notes, and prescription PDF attachments across deployments and restarts:
1. In the Web Service settings on Render, navigate to **Disks**.
2. Click **Add Disks**.
3. Set **Name**: `amrutam-attachments`, **Mount Path**: `/data/secure_attachments`, **Size**: `10 GB` (or desired capacity).
4. Ensure `STORAGE_DIR=/data/secure_attachments` is configured in your service environment variables.

### Step 5: (Optional) Scale with a Dedicated Background Worker
By default, `ENABLE_IN_PROCESS_WORKER=true` runs the notification queue worker inside Express. For high-volume or multi-replica deployments:
1. Create a new **Background Worker** service on Render.
2. Set the build command: `npm install && npx prisma generate`
3. Set the start command: `npm run worker`
4. Connect the same `DATABASE_URL` as the web service.
5. On the Web Service, set `ENABLE_IN_PROCESS_WORKER=false` to avoid redundant polling across multiple web replicas.

### Step 6: PgBouncer Connection Pooling (High-Volume Production)
When scaling to hundreds of concurrent users:
1. In Render Dashboard under your PostgreSQL database, copy the **Pooled Connection String** (PgBouncer pooler on port 6543).
2. Set `DATABASE_URL` in your web service to the pooled connection string, appending `?pgbouncer=true&connection_limit=20`.
3. In `render.yaml`, change the `DATABASE_URL` property from `connectionString` to `pooledConnectionString`.
4. Migrations (`prisma migrate deploy`) automatically execute during build time against the direct port to guarantee transaction DDL safety.

---

## 4. Option C: Vercel Deployment

For deployments on Vercel:
1. Import your repository into Vercel.
2. Vercel automatically detects [`vercel.json`](file:///c:/telemedicine-backend/vercel.json) and configures the Node runtime.
3. In **Project Settings** ➔ **Environment Variables**, provide your `DATABASE_URL` (pointing to Render PostgreSQL, Supabase, or Neon) along with the JWT and webhook secrets listed above.
4. Set the **Build Command** to:
   ```bash
   npx prisma generate && npx prisma migrate deploy
   ```
5. Deploy.

---

## 5. Verifying Deployment Health

Once deployed, test your public URL (e.g., `https://amrutam-telemedicine-api.onrender.com`):

1. **Liveness Probe**:
   ```bash
   curl -I https://your-service.onrender.com/api/v1/health
   # Returns: HTTP 200 OK
   ```

2. **Database Readiness Probe**:
   ```bash
   curl https://your-service.onrender.com/api/v1/ready
   # Returns: {"status":"ready","service":"amrutam-telemedicine-backend","dependencies":{"database":{"status":"connected"}}}
   ```

3. **Interactive API Documentation**:
   Navigate to `https://your-service.onrender.com/api-docs` in your browser.

---

## 6. Backups & Disaster Recovery on Render

1. **Automated Daily Backups**: Render Managed PostgreSQL automatically performs daily backups with retention based on your selected plan.
2. **Manual On-Demand Export**:
   You can export database dumps at any time using your external connection string:
   ```bash
   pg_dump "$EXTERNAL_DATABASE_URL" -Fc -v -f "amrutam_backup_$(date +%Y%m%d).dump"
   ```
3. **Database Restore**:
   ```bash
   pg_restore --clean --if-exists --no-owner -d "$EXTERNAL_DATABASE_URL" -v "amrutam_backup.dump"
   ```
