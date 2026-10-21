# Booking Sequence & Concurrency Handling

## 1. Overview

Appointment booking in a telemedicine platform is a high-contention operation where multiple patients may attempt to book the same doctor availability slot simultaneously.

The Amrutam booking engine combines:
1. **Idempotency Keys**: To protect against duplicate submissions resulting from network timeouts or retries.
2. **ACID Transactions (`prisma.$transaction`)**: To execute slot verification, slot state change, and appointment creation in a single atomic database operation.
3. **Database Constraints**: `slotId UNIQUE` on the `consultations` table guarantees at the database level that no two consultations can point to the same availability slot.

---

## 2. Booking Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Patient as Patient (Client)
    participant API as API Server (Express)
    participant Auth as Auth & Validation Middleware
    participant Service as ConsultationService
    participant DB as PostgreSQL Database

    Patient->>API: POST /api/v1/consultations/book (slotId, notes, idempotencyKey)
    API->>Auth: Verify JWT & Validate Request Schema (Zod)
    
    alt Invalid Schema / Missing JWT
        Auth-->>Patient: 401 Unauthorized / 422 Unprocessable Entity
    end
    
    Auth->>Service: bookConsultation(patientId, payload)
    
    opt Idempotency Key Provided
        Service->>DB: Query existing consultation by idempotencyKey
        alt Key Found (Prior Booking)
            DB-->>Service: Return Existing Consultation
            Service-->>Patient: 200/201 OK (Idempotent response with existing record)
        end
    end

    Service->>DB: Begin Serializable/Repeatable Read Transaction
    
    Service->>DB: SELECT * FROM availability_slots WHERE id = slotId
    
    alt Slot Not Found
        DB-->>Service: null
        Service-->>API: ApiError.notFound("Slot not found")
        API-->>Patient: 404 Not Found
    else Slot Status != 'AVAILABLE'
        DB-->>Service: slot (status: 'BOOKED')
        Service-->>API: ApiError.conflict("Slot already booked")
        API-->>Patient: 409 Conflict
    else Slot is AVAILABLE
        DB-->>Service: slot (status: 'AVAILABLE')
        
        Service->>DB: UPDATE availability_slots SET status = 'BOOKED' WHERE id = slotId
        Service->>DB: INSERT INTO consultations (consultationNumber, patientId, doctorId, slotId, status, ...)
        Service->>DB: INSERT INTO audit_logs (action: 'BOOK_CONSULTATION', entityId, ...)
        
        Service->>DB: Commit Transaction
        DB-->>Service: Transaction Committed Successfully
        
        Service-->>API: Return New Consultation Record
        API-->>Patient: 201 Created (ApiResponse with consultation details)
    end
```

---

## 3. Concurrency Protection Deep Dive

### Concurrent Contention Scenario
Consider two patients, **Patient A** and **Patient B**, simultaneously submitting a booking request for Doctor X at 10:00 AM (`slotId: 42`).

```
Time | Patient A Request                       | Patient B Request
-----|-----------------------------------------|-----------------------------------------
T1   | Submits POST /consultations/book        | Submits POST /consultations/book
T2   | Opens DB Transaction TxA                | Opens DB Transaction TxB
T3   | SELECT slot 42 -> Status: AVAILABLE     | SELECT slot 42 -> Status: AVAILABLE
T4   | UPDATE slot 42 SET status = 'BOOKED'    | Waits or checks status
T5   | INSERT consultation (slotId: 42)        | Attempts INSERT consultation (slotId: 42)
T6   | TxA COMMITS successfully                | TxB encounters slotId UNIQUE constraint or slot status conflict
T7   | Receives 201 Created                    | Receives 409 Conflict ("Slot no longer available")
```

Even under high network concurrency:
- Only **one** transaction commits successfully.
- The losing transaction triggers either a status conflict check or violates the `slotId UNIQUE` constraint.
- The error handler intercepts the PostgreSQL unique violation (Prisma error code `P2002`) and transforms it into a clean, structured `409 Conflict` response with an explanatory message.
