# Per-User Stellar Cyber API Key Implementation

## 📋 Overview

This feature allows each user to have their own Stellar Cyber API key for updating alert and case statuses. Instead of using a single shared integration API key, users can authenticate with their personal Stellar Cyber credentials.

**Key Benefits:**
- ✅ Better audit trail (each action is tied to a specific user's credentials)
- ✅ User-level access control for Stellar Cyber operations
- ✅ Flexible credentials management (each user can have different API keys)
- ✅ Administrator can manage user credentials via user management interface

---

## 🔧 Implementation Details

### 1. Database Schema Changes

**File**: [prisma/schema.prisma](prisma/schema.prisma)

Added field to User model:
```prisma
model User {
  // ... existing fields ...
  stellarCyberApiKey String? @map("stellar_cyber_api_key")  // Optional: User's personal API key
  // ... rest of fields ...
}
```

**Migration**: [prisma/migrations/20260107_add_stellar_api_key_to_user/migration.sql](prisma/migrations/20260107_add_stellar_api_key_to_user/migration.sql)

Run migration:
```bash
npx prisma migrate deploy
```

---

## 🔑 API Endpoints

### User Personal Credentials

#### GET `/api/users/me/stellar-key`
Check if current user has Stellar API key configured

**Response**:
```json
{
  "success": true,
  "hasApiKey": true,
  "message": "Stellar API key is configured"
}
```

#### POST `/api/users/me/stellar-key`
Save or update current user's Stellar Cyber API key

**Request Body**:
```json
{
  "apiKey": "your-stellar-cyber-api-key"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Stellar Cyber API key saved successfully"
}
```

#### DELETE `/api/users/me/stellar-key`
Delete current user's Stellar Cyber API key

**Response**:
```json
{
  "success": true,
  "message": "Stellar Cyber API key deleted successfully"
}
```

---

### Admin User Management

#### GET `/api/users/[userId]/stellar-key`
**Permission**: `manage_users` (Administrator only)

Check if a specific user has Stellar API key configured

**Response**:
```json
{
  "success": true,
  "userId": "user-id",
  "userEmail": "user@example.com",
  "userName": "John Doe",
  "hasApiKey": true,
  "message": "User has Stellar API key configured"
}
```

#### POST `/api/users/[userId]/stellar-key`
**Permission**: `manage_users` (Administrator only)

Admin: Save or update a user's Stellar Cyber API key

**Request Body**:
```json
{
  "apiKey": "stellar-api-key"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Stellar Cyber API key saved for user user@example.com",
  "userId": "user-id"
}
```

#### DELETE `/api/users/[userId]/stellar-key`
**Permission**: `manage_users` (Administrator only)

Admin: Delete a user's Stellar Cyber API key

**Response**:
```json
{
  "success": true,
  "message": "Stellar Cyber API key deleted for user user@example.com",
  "userId": "user-id"
}
```

---

## 🔄 Update Workflows

### Alert Status Update Flow

**File**: [app/api/alerts/update/route.ts](app/api/alerts/update/route.ts)

```
1. User sends POST /api/alerts/update
   {
     alertId: "...",
     status: "Closed",
     comments: "...",
     userId: (auto-captured from session)
   }
   
2. Check user permission: update_alert_status
   
3. Update alert in local database
   
4. If Stellar Cyber integration:
   → Call updateAlertStatus() with userId parameter
   
5. updateAlertStatus() logic:
   a. If userId provided:
      - Fetch user's stellarCyberApiKey from database
      - If no API key: return error asking user to add key
      - Use user's API key for Bearer token
   
   b. If no userId or no user API key:
      - Fallback to integration credentials (old behavior)
   
   c. POST to /connect/api/update_ser with user's token
```

### Case Status Update Flow

**File**: [app/api/cases/[id]/route.ts](app/api/cases/[id]/route.ts)

```
1. User sends PUT /api/cases/{caseId}
   {
     status: "Closed",
     severity: "High",
     userId: (auto-captured from session)
   }
   
2. Update case in local database
   
3. If Stellar Cyber integration:
   → Call updateCaseInStellarCyber() with userId parameter
   
4. updateCaseInStellarCyber() logic:
   a. If userId provided:
      - Fetch user's stellarCyberApiKey
      - If no API key: return error
      - Use user's API key for Bearer token
   
   b. If no userId or no user API key:
      - Fallback to integration credentials (old behavior)
   
   c. PUT to /connect/api/v1/cases/{caseId} with user's token
```

---

## 📁 Modified Files

### Core API Functions

#### [lib/api/stellar-cyber.ts](lib/api/stellar-cyber.ts)

Modified `updateAlertStatus()` function:
```typescript
export async function updateAlertStatus(params: {
  index: string
  alertId: string
  status: AlertStatus
  comments?: string
  assignee?: string
  integrationId?: string
  userId?: string  // NEW: Use user's personal API key
}): Promise<any>
```

**Logic**:
1. If `userId` provided: Fetch user's `stellarCyberApiKey` from database
2. If user has API key: Use it as Bearer token
3. If user doesn't have API key: Return error message
4. If no `userId` provided: Fallback to integration credentials (backward compatible)

#### [lib/api/stellar-cyber-case.ts](lib/api/stellar-cyber-case.ts)

Modified `updateCaseInStellarCyber()` function:
```typescript
export async function updateCaseInStellarCyber(params: {
  caseId: string
  integrationId?: string
  userId?: string  // NEW: Use user's personal API key
  updates: {
    status?: string
    assignee?: string
    severity?: string
  }
}): Promise<any>
```

**Logic**: Same as `updateAlertStatus()`, with support for both user API keys and fallback to integration credentials.

### API Routes

#### [app/api/alerts/update/route.ts](app/api/alerts/update/route.ts)
- Added `userId: user.id` parameter when calling `updateStellarCyberAlertStatus()`

#### [app/api/cases/[id]/route.ts](app/api/cases/[id]/route.ts)
- Added `userId: user.id` parameter when calling `updateCaseInStellarCyber()`

### New Helper Functions

#### [lib/api/user-stellar-credentials.ts](lib/api/user-stellar-credentials.ts)

Utility functions for managing user credentials:
```typescript
export async function getUserStellarApiKey(userId: string): Promise<string | null>
export async function userHasStellarApiKey(userId: string): Promise<boolean>
export async function setStellarApiKey(userId: string, apiKey: string): Promise<boolean>
export async function deleteStellarApiKey(userId: string): Promise<boolean>
export async function validateStellarApiKey(apiKey: string, stellarHost: string): Promise<{valid: boolean, error?: string}>
```

### New API Endpoints

#### [app/api/users/me/stellar-key/route.ts](app/api/users/me/stellar-key/route.ts)
- `GET /api/users/me/stellar-key` - Check user's API key status
- `POST /api/users/me/stellar-key` - Save/update API key
- `PUT /api/users/me/stellar-key` - Update API key (alias to POST)
- `DELETE /api/users/me/stellar-key` - Remove API key

#### [app/api/users/[userId]/stellar-key/route.ts](app/api/users/[userId]/stellar-key/route.ts)
- `GET /api/users/[userId]/stellar-key` - Admin: Check user's API key status
- `POST /api/users/[userId]/stellar-key` - Admin: Save/update user's API key
- `PUT /api/users/[userId]/stellar-key` - Admin: Update user's API key
- `DELETE /api/users/[userId]/stellar-key` - Admin: Remove user's API key

---

## 🔐 Security Considerations

### API Key Storage
- API keys are stored as plain text in the database
- **Recommendation**: Implement encryption at rest using a library like `crypto` or use PostgreSQL's `pgcrypto` extension

### Encrypted Storage Implementation (Optional)
```typescript
// lib/utils/crypto.ts
import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex')

export function encryptApiKey(apiKey: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
  let encrypted = cipher.update(apiKey)
  encrypted = Buffer.concat([encrypted, cipher.final()])
  const authTag = cipher.getAuthTag()
  return iv.toString('hex') + ':' + encrypted.toString('hex') + ':' + authTag.toString('hex')
}

export function decryptApiKey(encrypted: string): string {
  const parts = encrypted.split(':')
  const iv = Buffer.from(parts[0], 'hex')
  const encryptedBuf = Buffer.from(parts[1], 'hex')
  const authTag = Buffer.from(parts[2], 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encryptedBuf)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString()
}
```

### Permission Checks
- User can only view/manage their own API key via `/api/users/me/stellar-key`
- Only administrators (role: "administrator") can manage other users' API keys via `/api/users/[userId]/stellar-key`
- All API endpoints check `hasPermission()` before allowing operations

### API Key Validation
- API keys must not be empty
- API keys must be at least 10 characters
- API keys are trimmed before storing

---

## 📊 User Workflows

### Workflow 1: User Adding Their Own API Key

```
1. User logs in
2. Navigate to: Profile / Account Settings
3. Find: "Stellar Cyber API Key" section
4. Click: "Add API Key" button
5. Paste API key from Stellar Cyber
6. Click: "Save"
7. System: Saves to database, user can now update alerts/cases
```

### Workflow 2: Administrator Adding API Key for User

```
1. Admin logs in
2. Navigate to: User Management
3. Find and click user: "John Analyst"
4. Click: "Manage Credentials" tab
5. Click: "Add Stellar API Key"
6. Paste API key for that user
7. Click: "Save"
8. System: Saves key, user can now update alerts/cases
```

### Workflow 3: User Updating Alert Status (with personal API key)

```
1. User views alert
2. Click: "Update Status" button
3. System checks: Does user have Stellar API key?
   → Yes: Proceed with update using user's API key
   → No: Show error: "Please add your Stellar API key in profile settings"
4. User confirms status change
5. System: Sends update to Stellar Cyber with user's API key
6. Alert is updated in both local database and Stellar Cyber
```

---

## ✅ Testing

### Manual Testing

```bash
# Check current user's API key status
curl -X GET http://localhost:3000/api/users/me/stellar-key \
  -H "Authorization: Bearer {user-token}"

# Save user's API key
curl -X POST http://localhost:3000/api/users/me/stellar-key \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {user-token}" \
  -d '{"apiKey": "your-api-key-here"}'

# Admin: Check user's API key status
curl -X GET http://localhost:3000/api/users/{userId}/stellar-key \
  -H "Authorization: Bearer {admin-token}"

# Admin: Set user's API key
curl -X POST http://localhost:3000/api/users/{userId}/stellar-key \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {admin-token}" \
  -d '{"apiKey": "user-api-key"}'

# Update alert with user's API key
curl -X POST http://localhost:3000/api/alerts/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {user-token}" \
  -d '{
    "alertId": "alert-123",
    "status": "Closed",
    "comments": "Resolved"
  }'
```

### Test Scenarios

1. **User without API key trying to update alert**
   - Expected: Error message "User does not have Stellar Cyber API key configured"
   - Status: 400 Bad Request

2. **User with API key updating alert**
   - Expected: Alert status updated in Stellar Cyber using user's API key
   - Status: 200 OK

3. **Admin adding API key for user**
   - Expected: API key saved, user can now update alerts
   - Status: 200 OK

4. **Admin removing user's API key**
   - Expected: API key deleted, user cannot update alerts
   - Status: 200 OK

5. **Read-only user trying to update alert**
   - Expected: Permission denied error
   - Status: 403 Forbidden

---

## 🚀 Rollout Plan

1. **Deploy database migration**
   ```bash
   npx prisma migrate deploy
   ```

2. **Deploy code changes**
   - All modified files are backward compatible
   - Integration credentials will still work as fallback
   - Existing workflows will continue to function

3. **Notify users**
   - Send announcement about new personal API key feature
   - Provide documentation on how to add API key in profile

4. **Admin setup**
   - Administrators can optionally add API keys for users
   - Users can self-serve add their own keys

5. **Monitor**
   - Check logs for any errors in update operations
   - Verify both user API keys and fallback credentials work

---

## 📝 Environment Variables

No new environment variables required. If you want to implement encryption, add:

```bash
# .env.local
ENCRYPTION_KEY=your-32-byte-hex-string-here
```

---

## 🔄 Backward Compatibility

✅ **Fully backward compatible**:
- Existing integration credentials still work as fallback
- If user doesn't have API key, system uses integration credentials
- All existing workflows continue to function without changes
- No breaking changes to existing APIs

---

## 📚 Related Files

- [STELLAR_CYBER_MECHANICS.md](STELLAR_CYBER_MECHANICS.md) - Overall Stellar Cyber integration documentation
- [prisma/schema.prisma](prisma/schema.prisma) - Database schema
- [lib/auth/password.ts](lib/auth/password.ts) - Permission checking utilities
- [lib/auth/session.ts](lib/auth/session.ts) - Current user session

---

Semua komponen sudah terintegrasi dan siap untuk digunakan!
