# Per-User Stellar Credentials: Architecture & Flow

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Frontend (UI)                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ User Profile Page    │    User Management (Admin)           │   │
│  │ ┌──────────────────┐ │ ┌───────────────────────────────┐   │   │
│  │ │ Stellar API Key  │ │ │ User List > Select > Credentials │   │   │
│  │ │ ┌──────────────┐ │ │ ┌───────────────────────────────┐   │   │
│  │ │ │ Input field  │ │ │ │ Add/Edit/Delete API Key       │   │   │
│  │ │ │ Save button  │ │ │ └───────────────────────────────┘   │   │
│  │ │ │ Delete button│ │ │                                       │   │
│  │ │ └──────────────┘ │ │ Alert/Case Update Page              │   │
│  │ └──────────────────┘ │ ┌───────────────────────────────┐   │   │
│  │                      │ │ Update Button                 │   │   │
│  │                      │ │ └─ Checks: User has key?      │   │   │
│  │                      │ │    ├─ Yes → Proceed          │   │   │
│  │                      │ │    └─ No → Show error        │   │   │
│  │                      │ └───────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        API Layer (Next.js)                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Personal Credentials Endpoints                               │   │
│  │ ┌────────────────────────────────────────────────────────┐   │   │
│  │ │ GET  /api/users/me/stellar-key                        │   │   │
│  │ │ POST /api/users/me/stellar-key     (save/update)      │   │   │
│  │ │ PUT  /api/users/me/stellar-key     (update)           │   │   │
│  │ │ DELETE /api/users/me/stellar-key   (remove)           │   │   │
│  │ └────────────────────────────────────────────────────────┘   │   │
│  │                                                                │   │
│  │ Admin Credential Management Endpoints (admin only)            │   │
│  │ ┌────────────────────────────────────────────────────────┐   │   │
│  │ │ GET  /api/users/[userId]/stellar-key                 │   │   │
│  │ │ POST /api/users/[userId]/stellar-key                 │   │   │
│  │ │ PUT  /api/users/[userId]/stellar-key                 │   │   │
│  │ │ DELETE /api/users/[userId]/stellar-key               │   │   │
│  │ └────────────────────────────────────────────────────────┘   │   │
│  │                                                                │   │
│  │ Alert/Case Update Endpoints                                   │   │
│  │ ┌────────────────────────────────────────────────────────┐   │   │
│  │ │ POST /api/alerts/update                               │   │   │
│  │ │   └─ Calls: updateAlertStatus(userId=user.id)        │   │   │
│  │ │                                                        │   │   │
│  │ │ PUT  /api/cases/[id]                                  │   │   │
│  │ │   └─ Calls: updateCaseInStellarCyber(userId=user.id) │   │   │
│  │ └────────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    Helper Functions & Utilities                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ lib/api/user-stellar-credentials.ts                          │   │
│  │ ┌────────────────────────────────────────────────────────┐   │   │
│  │ │ getUserStellarApiKey(userId)                          │   │   │
│  │ │ userHasStellarApiKey(userId)                          │   │   │
│  │ │ setStellarApiKey(userId, apiKey)                      │   │   │
│  │ │ deleteStellarApiKey(userId)                           │   │   │
│  │ │ validateStellarApiKey(apiKey, host)                   │   │   │
│  │ └────────────────────────────────────────────────────────┘   │   │
│  │                                                                │   │
│  │ lib/api/stellar-cyber.ts (modified)                           │   │
│  │ ┌────────────────────────────────────────────────────────┐   │   │
│  │ │ updateAlertStatus(userId?, integrationId?, ...)       │   │   │
│  │ │   ├─ If userId provided → Fetch user's API key       │   │   │
│  │ │   ├─ If API key found → Use Bearer token             │   │   │
│  │ │   ├─ If NOT found → Return error                     │   │   │
│  │ │   └─ Else → Fallback to integration credentials      │   │   │
│  │ └────────────────────────────────────────────────────────┘   │   │
│  │                                                                │   │
│  │ lib/api/stellar-cyber-case.ts (modified)                      │   │
│  │ ┌────────────────────────────────────────────────────────┐   │   │
│  │ │ updateCaseInStellarCyber(userId?, integrationId?, ...) │   │   │
│  │ │   └─ Same logic as updateAlertStatus()               │   │   │
│  │ └────────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      Database (Prisma/PostgreSQL)                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ users table                                                   │   │
│  │ ┌──────────────────────────────────────────────────────────┐ │   │
│  │ │ id                    VARCHAR(PK)                        │ │   │
│  │ │ email                 VARCHAR(UNIQUE)                    │ │   │
│  │ │ name                  VARCHAR                            │ │   │
│  │ │ password              VARCHAR                            │ │   │
│  │ │ role                  VARCHAR (admin|analyst|read-only)  │ │   │
│  │ │ status                VARCHAR (active|inactive)          │ │   │
│  │ │ stellar_cyber_api_key TEXT ← NEW FIELD                  │ │   │
│  │ │ created_at            TIMESTAMP                          │ │   │
│  │ │ updated_at            TIMESTAMP                          │ │   │
│  │ └──────────────────────────────────────────────────────────┘ │   │
│  │                                                                │   │
│  │ Other tables (Alert, Case) - unchanged                        │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                   Stellar Cyber API                                 │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ POST /connect/api/update_ser                                │   │
│  │   Authorization: Bearer {user_api_key}  ← Uses user's key   │   │
│  │   Payload: { index, _id, status, comments, assignee }      │   │
│  │                                                              │   │
│  │ PUT /connect/api/v1/cases/{caseId}                          │   │
│  │   Authorization: Bearer {user_api_key}  ← Uses user's key   │   │
│  │   Payload: { status, severity, assignee }                  │   │
│  │                                                              │   │
│  │ GET /connect/api/v1/cases (for sync - uses integration)     │   │
│  │ GET /connect/api/data/aella-ser-*/_search (for sync)        │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Alert Status Update Flow (Detailed)

```
User Clicks "Update Status" on Alert
        ↓
POST /api/alerts/update
{
  alertId: "alert-xyz",
  status: "Closed",
  comments: "Fixed",
  userId: (auto from session)
}
        ↓
Authenticate User
  └─ Check: Is user logged in? → YES
        ↓
Check Permission
  └─ Does user have 'update_alert_status' permission? → YES
        ↓
Find Alert in Database
  └─ SELECT * FROM alerts WHERE id = 'alert-xyz'
        ↓
Normalize Status (Closed, Open, In Progress, etc)
        ↓
Update Alert in Local Database
  └─ UPDATE alerts SET status='Closed', updatedAt=NOW()
  └─ INSERT INTO alert_timeline (status changed)
        ↓
Is Stellar Cyber Integration?
  ├─ YES ↓
  │   Call updateAlertStatus({
  │     index: alert.index,
  │     alertId: alert.externalId,
  │     status: 'Closed',
  │     comments: '...',
  │     integrationId: alert.integrationId,
  │     userId: user.id  ← IMPORTANT: Pass user ID
  │   })
  │
  │   Inside updateAlertStatus:
  │   ┌──────────────────────────────────────────┐
  │   │ 1. userId provided? → YES                │
  │   │    ├─ Query: SELECT stellarCyberApiKey  │
  │   │    │          FROM users WHERE id = ...  │
  │   │    │                                      │
  │   │    └─ Found API key? → YES               │
  │   │       └─ Use as Bearer token             │
  │   │       └─ POST /connect/api/update_ser    │
  │   │          Authorization: Bearer {key}    │
  │   │                                          │
  │   │    └─ NO API key found?                  │
  │   │       └─ Return error:                   │
  │   │          "User does not have            │
  │   │           Stellar API key configured"   │
  │   └──────────────────────────────────────────┘
  │   
  │   Stellar Cyber Returns Result
  │   └─ Update succeeded
  │
  └─ NO: Skip Stellar Cyber update
        ↓
Return Success Response
{
  success: true,
  message: "Alert status updated",
  alert: {updated alert data}
}
        ↓
Frontend Shows Success Message
Alert Status Now: Closed (Updated in both DB and Stellar Cyber)
```

---

## 🎯 Decision Tree: Which API Key to Use?

```
Call updateAlertStatus()?
    ↓
userId parameter provided?
    ├─ NO
    │   └─ Use integration credentials (OLD behavior)
    │       └─ Backward compatible!
    │
    └─ YES
        └─ Query database for user's stellarCyberApiKey
            ├─ Found API key?
            │   ├─ YES
            │   │   └─ Use user's API key as Bearer token
            │   │   └─ POST to Stellar Cyber with user's auth
            │   │
            │   └─ NO
            │       └─ Return error to user
            │           "Please add Stellar API key in profile"
            │       └─ Alert still updated locally (DB)
            │       └─ But NOT in Stellar Cyber
```

---

## 📊 Permission & Access Control

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Roles & Permissions                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ADMINISTRATOR                                                  │
│  ├─ Can add own Stellar API key                               │
│  ├─ Can update alert/case status (if has API key)             │
│  ├─ Can manage other users' Stellar API keys                  │
│  ├─ Can view who has/doesn't have API keys                    │
│  └─ Can delete other users' API keys                          │
│                                                                 │
│  ANALYST                                                        │
│  ├─ Can add own Stellar API key                               │
│  ├─ Can update alert/case status (if has API key)             │
│  ├─ Cannot manage other users' Stellar API keys               │
│  ├─ Cannot view other users' API key status                   │
│  └─ Cannot delete other users' API keys                       │
│                                                                 │
│  READ-ONLY                                                      │
│  ├─ Cannot add Stellar API key (no permission)                │
│  ├─ Cannot update alert/case status (no permission)           │
│  ├─ Cannot manage other users' Stellar API keys               │
│  └─ Cannot view other users' API key status                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔒 Data Security & Privacy

```
┌──────────────────────────────────────────────────────────┐
│               User Credentials Privacy                   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  User's Own Credentials                                 │
│  ├─ GET /api/users/me/stellar-key                      │
│  │  └─ Returns: { hasApiKey: true/false }              │
│  │     (Does NOT return actual API key)                 │
│  ├─ POST /api/users/me/stellar-key                     │
│  │  └─ Input: { apiKey: "..." }                        │
│  │     Stores in database (see encryption note)         │
│  └─ DELETE /api/users/me/stellar-key                   │
│     └─ Deletes key from database                        │
│                                                          │
│  Admin Managing User Credentials                        │
│  ├─ GET /api/users/{userId}/stellar-key               │
│  │  └─ Returns: { hasApiKey: true/false }              │
│  │     (Does NOT return actual API key)                 │
│  ├─ POST /api/users/{userId}/stellar-key              │
│  │  └─ Input: { apiKey: "..." }                        │
│  │     Stores in database                               │
│  └─ DELETE /api/users/{userId}/stellar-key            │
│     └─ Deletes key from database                        │
│                                                          │
│  ✅ API Keys NEVER sent to frontend                     │
│  ✅ API Keys NEVER logged in requests                   │
│  ✅ API Keys stored in database                         │
│  ⚠️  RECOMMENDATION: Encrypt at rest                    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 📈 State Transitions

```
User Entity Lifecycle with API Key
────────────────────────────────────

User Created
    │
    └─ stellar_cyber_api_key = NULL
        │
        └─ User logs in
            │
            ├─ Goes to Profile Settings
            │   │
            │   └─ Clicks "Add Stellar API Key"
            │       │
            │       └─ POST /api/users/me/stellar-key
            │           │
            │           └─ Database: SET stellar_cyber_api_key = 'xxx'
            │               │
            │               └─ User can now update alerts/cases
            │
            ├─ Updates alert status
            │   │
            │   └─ System fetches user's API key
            │       │
            │       └─ Uses it for Stellar Cyber auth
            │
            └─ (Optional) Removes API key
                │
                └─ DELETE /api/users/me/stellar-key
                    │
                    └─ Database: SET stellar_cyber_api_key = NULL
                        │
                        └─ User cannot update alerts/cases anymore
```

---

## 🧪 Testing Scenarios Matrix

```
┌──────────────────────────────────┬────────────────────┬──────────────────┐
│ Scenario                         │ Expected Result    │ Tested? (Y/N)    │
├──────────────────────────────────┼────────────────────┼──────────────────┤
│ User adds API key                │ Saved to DB        │ [ ]              │
│ User views their API key status  │ hasApiKey: true    │ [ ]              │
│ User updates alert (with key)    │ Success            │ [ ]              │
│ User updates alert (no key)      │ Error message      │ [ ]              │
│ User deletes their API key       │ Deleted from DB    │ [ ]              │
│ User updates alert after delete  │ Error message      │ [ ]              │
│ Admin adds key for user          │ Saved to DB        │ [ ]              │
│ Admin views user's key status    │ hasApiKey: true    │ [ ]              │
│ Admin deletes user's key         │ Deleted from DB    │ [ ]              │
│ Non-admin views other user key   │ 403 Forbidden      │ [ ]              │
│ Non-admin deletes other user key │ 403 Forbidden      │ [ ]              │
│ Backward compat (no userId)      │ Uses integration    │ [ ]              │
│ Case update with user API key    │ Success            │ [ ]              │
│ Case update without user API key │ Error message      │ [ ]              │
└──────────────────────────────────┴────────────────────┴──────────────────┘
```

---

**Diagram Last Updated**: January 7, 2026  
**Status**: Complete & Ready for Implementation
