# Two-Step Verification (MFA / 2FA) Setup & Verification Guide

This guide explains the end-to-end workflow for enrolling, verifying, and logging in using **Multi-Factor Authentication (MFA / 2FA)** on the Amrutam Telemedicine Backend platform.

The system uses standard **RFC 6238 Time-based One-Time Passwords (TOTP)** compatible with Google Authenticator, Microsoft Authenticator, and Authy.

---

## 1. Overview of the MFA Workflow

```
┌─────────────────────────┐
│ 1. POST /auth/mfa/setup │  ──► Generates Base32 Secret & otpauth:// URI
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 2. Get 6-Digit Code     │  ──► Via Google Authenticator or `npm run mfa:code <SECRET>`
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 3. POST /auth/mfa/verify│  ──► Validates 6-digit code & turns ON `isMfaEnabled: true`
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 4. Future Logins        │  ──► POST /auth/login returns `mfaRequired: true`
│                         │  ──► Complete via POST /auth/mfa/login with fresh 6-digit code
└─────────────────────────┘
```

---

## 2. Step-by-Step Instructions

### Step 1: Login to Get Your Bearer Token
MFA configuration requires an authenticated session.

**Endpoint:** `POST /api/v1/auth/login`  
**Body:**
```json
{
  "email": "dr.ayur@amrutam.local",
  "password": "DemoPassword123!"
}
```

Copy the `accessToken` from the response and set your header:
```http
Authorization: Bearer <accessToken>
```

---

### Step 2: Initiate MFA Enrollment

**Endpoint:** `POST /api/v1/auth/mfa/setup`  
**Header:** `Authorization: Bearer <accessToken>`  
*(No request body needed)*

**cURL Example:**
```bash
curl -X POST http://localhost:5000/api/v1/auth/mfa/setup \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>"
```

**Response (HTTP 200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "MFA setup initiated",
  "data": {
    "secret": "JBSWY3DPEHPK3PXPEXAMPLE",
    "otpAuthUri": "otpauth://totp/Amrutam%20Telemedicine:dr.ayur@amrutam.local?secret=JBSWY3DPEHPK3PXPEXAMPLE&issuer=Amrutam%20Telemedicine"
  }
}
```

> **Important:** Save the `secret` string. You will need it in Step 3.

---

### Step 3: Get Your 6-Digit Code

You can obtain the current 6-digit TOTP code through any of the following 3 ways:

#### Option A: Built-in Terminal Command (Fastest for Testing)
Run the project's generator script with your secret:
```bash
npm run mfa:code JBSWY3DPEHPK3PXPEXAMPLE
```
*or*
```bash
node scripts/generate-mfa-code.js JBSWY3DPEHPK3PXPEXAMPLE
```
**Output:**
```
🔐 Your 6-Digit MFA Verification Code:
   >>> 555024 <<<
```

#### Option B: Smartphone Authenticator App (Google / Microsoft Authenticator)
1. Open **Google Authenticator** or **Microsoft Authenticator** on your phone.
2. Tap **+** and choose **Enter a setup key** (Manual Entry).
3. Set Account Name: `Amrutam Doctor`
4. Set Key: Paste your `secret` from Step 2.
5. Key Type: `Time-based`.
6. Tap **Add**. Your phone will display a live 6-digit code refreshing every 30 seconds.

#### Option C: Browser Web Tool
Visit [totp.danhersam.com](https://totp.danhersam.com/) and paste your secret to view the live 6-digit code.

---

### Step 4: Verify and Activate MFA

Submit the `secret` and the 6-digit `code` to complete enrollment.

**Endpoint:** `POST /api/v1/auth/mfa/verify`  
**Header:** `Authorization: Bearer <accessToken>`  
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "secret": "JBSWY3DPEHPK3PXPEXAMPLE",
  "code": "555024"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:5000/api/v1/auth/mfa/verify \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "JBSWY3DPEHPK3PXPEXAMPLE",
    "code": "555024"
  }'
```

**Response (HTTP 200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Two-factor authentication successfully enabled",
  "data": {
    "isMfaEnabled": true
  }
}
```

**Two-Step Verification is now permanently active on this account.**

---

## 3. How to Log In With 2FA Enabled

Once MFA is enabled, login becomes a two-step challenge:

### Step 1: Submit Credentials
`POST /api/v1/auth/login` with your email and password:
```json
{
  "email": "dr.ayur@amrutam.local",
  "password": "DemoPassword123!"
}
```

**Response (HTTP 200 OK — Challenge Triggered):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Two-factor authentication code required",
  "data": {
    "mfaRequired": true,
    "mfaSessionToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Step 2: Complete Challenge with 6-Digit Code
Submit the temporary `mfaSessionToken` and current 6-digit code from your authenticator:

**Endpoint:** `POST /api/v1/auth/mfa/login`  
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "mfaSessionToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "code": "819402"
}
```

**Response (HTTP 200 OK — Final Tokens Issued):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "MFA authentication successful",
  "data": {
    "user": {
      "id": "e44ef776-7b90-49b5-993a-5249072021f7",
      "email": "dr.ayur@amrutam.local",
      "role": "DOCTOR"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsIn..."
    }
  }
}
```

---

## 4. How to Disable MFA

To disable Two-Factor Authentication, the user must provide both their password and a valid 6-digit TOTP code to prevent unauthorized deactivation.

**Endpoint:** `POST /api/v1/auth/mfa/disable`  
**Header:** `Authorization: Bearer <accessToken>`  
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "password": "DemoPassword123!",
  "code": "819402"
}
```

**Response (HTTP 200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Two-factor authentication disabled successfully",
  "data": {
    "isMfaEnabled": false
  }
}
```

---

## 5. Security Protections Built-In

1. **Anti-Replay Lock:** Each 6-digit code can only be used once. Attempting to submit the same code twice within its 30-second window is rejected with `HTTP 401: Two-factor authentication code has already been used`.
2. **Encrypted Storage:** Secrets are encrypted in PostgreSQL using **AES-256-GCM** with authenticated checksums. Plaintext secrets are never stored.
3. **Time-Drift Window:** The server allows a ±30 second drift window to account for clock skew between user devices and the server.
4. **Audit Logging:** Every successful MFA activation, login, and deactivation is recorded in the `AuditLog` table.
