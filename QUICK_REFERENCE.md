# Quick Reference: Per-User Stellar API Key

## 🚀 Quick Start

### 1. Deploy Migration
```bash
npx prisma migrate deploy
```

### 2. Add Your API Key (as user)
```bash
curl -X POST http://localhost:3000/api/users/me/stellar-key \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {your-token}" \
  -d '{"apiKey": "your-stellar-key"}'
```

### 3. Check Status
```bash
curl -X GET http://localhost:3000/api/users/me/stellar-key \
  -H "Authorization: Bearer {your-token}"
```

### 4. Update Alert Status (uses your API key)
```bash
curl -X POST http://localhost:3000/api/alerts/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {your-token}" \
  -d '{
    "alertId": "alert-id",
    "status": "Closed"
  }'
```

---

## 🔑 API Endpoints

### User's Own Credentials
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/users/me/stellar-key` | Check if you have API key |
| POST | `/api/users/me/stellar-key` | Save your API key |
| PUT | `/api/users/me/stellar-key` | Update your API key |
| DELETE | `/api/users/me/stellar-key` | Delete your API key |

### Admin: Manage User Credentials (admin only)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/users/{userId}/stellar-key` | Check user's API key status |
| POST | `/api/users/{userId}/stellar-key` | Save user's API key |
| PUT | `/api/users/{userId}/stellar-key` | Update user's API key |
| DELETE | `/api/users/{userId}/stellar-key` | Delete user's API key |

---

## 📂 Files Modified

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added `stellarCyberApiKey` field to User |
| `lib/api/stellar-cyber.ts` | Updated `updateAlertStatus()` to use user API key |
| `lib/api/stellar-cyber-case.ts` | Updated `updateCaseInStellarCyber()` to use user API key |
| `app/api/alerts/update/route.ts` | Pass `userId` to update function |
| `app/api/cases/[id]/route.ts` | Pass `userId` to update function |

## 📁 New Files Created

| File | Purpose |
|------|---------|
| `lib/api/user-stellar-credentials.ts` | Helper functions for credential management |
| `app/api/users/me/stellar-key/route.ts` | User personal credential endpoints |
| `app/api/users/[userId]/stellar-key/route.ts` | Admin credential management endpoints |
| `prisma/migrations/20260107_add_stellar_api_key_to_user/migration.sql` | Database migration |
| `PER_USER_STELLAR_CREDENTIALS.md` | Detailed documentation |
| `IMPLEMENTATION_SUMMARY.md` | Implementation overview |

---

## 🔄 How It Works

**Alert/Case Update Flow**:
```
User clicks "Update" 
    ↓
System checks: User has Stellar API key?
    ├─ YES → Use user's API key for Stellar API call
    ├─ NO → Return error: "Please add API key in profile"
    └─ No userId param → Fallback to integration credentials (backward compatible)
    ↓
Alert/Case status updated
```

---

## ✅ Permissions Required

| Role | Can Update Alert/Case | Can Add Own API Key | Can Manage Others' Keys |
|------|----------------------|-------------------|------------------------|
| Administrator | ✅ (if has API key) | ✅ | ✅ |
| Analyst | ✅ (if has API key) | ✅ | ❌ |
| Read-Only | ❌ | ❌ | ❌ |

---

## 📊 Examples

### Admin adds API key for user
```bash
curl -X POST http://localhost:3000/api/users/user123/stellar-key \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {admin-token}" \
  -d '{"apiKey": "user-api-key"}'
```

### User updates alert (auto-uses user's API key)
```bash
curl -X POST http://localhost:3000/api/alerts/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {user-token}" \
  -d '{
    "alertId": "alert-xyz",
    "status": "Closed",
    "severity": "High"
  }'
# System automatically:
# 1. Gets user.stellarCyberApiKey from database
# 2. Uses it as Bearer token for Stellar API
# 3. Updates in Stellar Cyber with user's credentials
```

### User removes their API key
```bash
curl -X DELETE http://localhost:3000/api/users/me/stellar-key \
  -H "Authorization: Bearer {user-token}"
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Make sure token is valid |
| 403 Forbidden | Only admins can manage other users' keys |
| 404 Not Found | User doesn't exist |
| "User does not have Stellar API key" | User needs to add API key in profile |
| 500 Server Error | Check logs for database/API errors |

---

## 📖 More Details

See [PER_USER_STELLAR_CREDENTIALS.md](PER_USER_STELLAR_CREDENTIALS.md) for:
- Detailed implementation docs
- Security considerations
- Encryption recommendations
- Testing instructions
- Full workflow documentation

---

**Status**: ✅ Ready for Production

**Last Updated**: January 7, 2026
