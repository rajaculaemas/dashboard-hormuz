# ✅ Per-User Stellar Cyber API Key Implementation - Complete

## 📋 Summary of Changes

Anda sudah menginginkan mekanisme baru untuk update alert dan case status di Stellar Cyber menggunakan API token dari masing-masing user. Berikut implementasi lengkapnya:

---

## 🎯 What Was Changed

### 1. **Database Schema** ✅
**File**: [prisma/schema.prisma](prisma/schema.prisma)

Tambah field ke User model:
```prisma
stellarCyberApiKey String? @map("stellar_cyber_api_key")
```

**Migration**: [prisma/migrations/20260107_add_stellar_api_key_to_user/migration.sql](prisma/migrations/20260107_add_stellar_api_key_to_user/migration.sql)

---

### 2. **Alert Update API** ✅
**File**: [lib/api/stellar-cyber.ts](lib/api/stellar-cyber.ts)

Modified `updateAlertStatus()`:
- Accept `userId` parameter
- Fetch user's API key dari database
- Jika user punya API key → Gunakan untuk Bearer token
- Jika user tidak punya API key → Return error (user harus add key di profile)
- Jika userId tidak provided → Fallback ke integration credentials (backward compatible)

```typescript
export async function updateAlertStatus(params: {
  index: string
  alertId: string
  status: AlertStatus
  comments?: string
  assignee?: string
  integrationId?: string
  userId?: string  // ← NEW: Pass user ID untuk use user's API key
}): Promise<any>
```

---

### 3. **Case Update API** ✅
**File**: [lib/api/stellar-cyber-case.ts](lib/api/stellar-cyber-case.ts)

Modified `updateCaseInStellarCyber()`:
- Accept `userId` parameter
- Logic sama seperti alert update
- Support both user API keys dan fallback ke integration credentials

```typescript
export async function updateCaseInStellarCyber(params: {
  caseId: string
  integrationId?: string
  userId?: string  // ← NEW: Pass user ID untuk use user's API key
  updates: { status?, assignee?, severity? }
})
```

---

### 4. **API Endpoints Updated** ✅

#### Update Alert Status
**File**: [app/api/alerts/update/route.ts](app/api/alerts/update/route.ts)

Sekarang pass `userId` ketika call `updateStellarCyberAlertStatus()`:
```typescript
await updateStellarCyberAlertStatus({
  index: alert.index,
  alertId: alert.externalId,
  status: normalizedStatus,
  comments,
  integrationId: alert.integrationId,
  userId: user.id,  // ← ADDED: Pass user ID
})
```

#### Update Case Status
**File**: [app/api/cases/[id]/route.ts](app/api/cases/[id]/route.ts)

Sekarang pass `userId` ketika call `updateCaseInStellarCyber()`:
```typescript
const stellarResult = await updateCaseInStellarCyber({
  caseId: updatedCase.externalId,
  integrationId: updatedCase.integrationId,
  userId: user.id,  // ← ADDED: Pass user ID
  updates: { status, severity, assignee }
})
```

---

### 5. **User Credential Management Endpoints** ✅

#### Current User (Personal Profile)
**File**: [app/api/users/me/stellar-key/route.ts](app/api/users/me/stellar-key/route.ts)

```
GET    /api/users/me/stellar-key         - Check if user has API key
POST   /api/users/me/stellar-key         - Save/update user's API key
PUT    /api/users/me/stellar-key         - Update API key (alias to POST)
DELETE /api/users/me/stellar-key         - Delete user's API key
```

#### Admin User Management
**File**: [app/api/users/[userId]/stellar-key/route.ts](app/api/users/[userId]/stellar-key/route.ts)

```
GET    /api/users/[userId]/stellar-key   - Admin: Check user's API key (admin only)
POST   /api/users/[userId]/stellar-key   - Admin: Save/update user's API key (admin only)
PUT    /api/users/[userId]/stellar-key   - Admin: Update user's API key (admin only)
DELETE /api/users/[userId]/stellar-key   - Admin: Delete user's API key (admin only)
```

---

### 6. **Helper Functions** ✅
**File**: [lib/api/user-stellar-credentials.ts](lib/api/user-stellar-credentials.ts)

```typescript
export async function getUserStellarApiKey(userId: string): Promise<string | null>
export async function userHasStellarApiKey(userId: string): Promise<boolean>
export async function setStellarApiKey(userId: string, apiKey: string): Promise<boolean>
export async function deleteStellarApiKey(userId: string): Promise<boolean>
export async function validateStellarApiKey(apiKey: string, stellarHost: string): Promise<{valid, error?}>
```

---

## 📊 User Workflows

### User dengan role Administrator
✅ Bisa:
- Add Stellar API key untuk user lain melalui menu User Management
- View siapa saja yang punya/tidak punya Stellar API key
- Delete API key dari user mana saja
- Update alert/case status (dengan personal API key mereka)

### User dengan role Analyst
✅ Bisa:
- Add Stellar API key mereka sendiri di Profile/Account Settings
- Update alert/case status (jika mereka punya API key)

❌ Tidak bisa:
- Update alert/case status (jika tidak punya API key)
- Manage API key user lain

### User dengan role Read-Only
❌ Tidak bisa:
- Update alert/case status (no permission)
- Add API key (no permission)

---

## 🔄 How It Works

### Scenario 1: User dengan API Key Update Alert

```
1. User klik "Update Status" pada alert
2. POST /api/alerts/update
   └─ Check: User punya permission? → YES
   
3. Update alert di local database
4. Call updateAlertStatus(userId=user.id)
   └─ Fetch dari DB: SELECT stellarCyberApiKey FROM users WHERE id = user.id
   └─ Found API key → Use it as Bearer token
   └─ POST /connect/api/update_ser dengan:
      Authorization: Bearer {user_api_key}
      
5. Alert status updated in Stellar Cyber
```

### Scenario 2: User tanpa API Key Update Alert

```
1. User klik "Update Status" pada alert
2. POST /api/alerts/update
   └─ Check: User punya permission? → YES
   
3. Update alert di local database
4. Call updateAlertStatus(userId=user.id)
   └─ Fetch dari DB: SELECT stellarCyberApiKey FROM users WHERE id = user.id
   └─ NO API key found
   └─ Return error: "User does not have Stellar API key configured. 
                     Please add it in your profile settings."
                     
5. Alert updated locally, but NOT in Stellar Cyber
```

### Scenario 3: Fallback to Integration Credentials

```
1. Legacy code atau API tidak pass userId
2. Call updateAlertStatus() tanpa userId
   └─ userId is NULL
   └─ Use integration credentials (OLD behavior)
   └─ Backward compatible!
```

---

## 🚀 Next Steps

### 1. Run Migration
```bash
cd /home/soc/soc-dashboard
npx prisma migrate deploy
```

### 2. Test with curl
```bash
# Add API key untuk current user
curl -X POST http://localhost:3000/api/users/me/stellar-key \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {your-token}" \
  -d '{"apiKey": "your-stellar-api-key"}'

# Check API key status
curl -X GET http://localhost:3000/api/users/me/stellar-key \
  -H "Authorization: Bearer {your-token}"

# Update alert status (akan gunakan user's API key)
curl -X POST http://localhost:3000/api/alerts/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {your-token}" \
  -d '{
    "alertId": "alert-123",
    "status": "Closed",
    "comments": "Fixed"
  }'
```

### 3. Frontend Implementation (Optional)
Tambah di User Profile/Account Settings:
- Input field untuk Stellar API Key
- Button: "Save", "Delete"
- Show: "✓ API Key is configured" atau "✗ No API Key"

Di Admin User Management:
- Add field: "Stellar API Key" untuk tiap user
- Button: "Save", "Delete"
- Show status: "Has API Key" / "No API Key"

---

## 📝 Important Notes

### Penarikan Alert & Case (Pull Operations)
✅ **Tetap menggunakan Integration Credentials** (tidak berubah)
- Sync alert: Masih pakai credentials dari integration
- Sync case: Masih pakai credentials dari integration
- Hanya UPDATE operations yang gunakan user's API key

### Error Handling
Jika user tidak punya API key dan coba update alert/case:
- Database tetap di-update dengan status baru
- Tapi Stellar Cyber tidak akan di-update
- User akan lihat error message yang jelas

### Backward Compatibility
✅ **Fully backward compatible**
- Existing code yang tidak pass `userId` akan tetap work
- Akan fallback ke integration credentials otomatis
- No breaking changes

### Security
- API keys stored as plain text di database
- Recommendations: Implement encryption (lihat di PER_USER_STELLAR_CREDENTIALS.md)
- Permission checks: Only admins bisa manage other users' keys

---

## 📚 Documentation

Semua dokumentasi lengkap ada di:
- [PER_USER_STELLAR_CREDENTIALS.md](PER_USER_STELLAR_CREDENTIALS.md) - Dokumentasi lengkap feature
- [STELLAR_CYBER_MECHANICS.md](STELLAR_CYBER_MECHANICS.md) - Overview Stellar Cyber integration

---

## ✨ Summary

| Aspek | Status |
|-------|--------|
| Database Schema | ✅ Modified (prisma/schema.prisma) |
| Prisma Migration | ✅ Created (prisma/migrations/20260107_add_stellar_api_key_to_user) |
| updateAlertStatus() | ✅ Updated (supports userId param) |
| updateCaseInStellarCyber() | ✅ Updated (supports userId param) |
| Alert Update Endpoint | ✅ Updated (passes userId) |
| Case Update Endpoint | ✅ Updated (passes userId) |
| User Personal Credentials API | ✅ Created (/api/users/me/stellar-key) |
| Admin Credentials Management API | ✅ Created (/api/users/[userId]/stellar-key) |
| Helper Functions | ✅ Created (lib/api/user-stellar-credentials.ts) |
| Documentation | ✅ Complete (PER_USER_STELLAR_CREDENTIALS.md) |

Semua komponen sudah complete dan siap untuk deployment! 🚀
