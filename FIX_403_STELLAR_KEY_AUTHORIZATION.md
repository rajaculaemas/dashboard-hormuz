# 🐛 Fix: 403 Forbidden Error pada Stellar API Key Endpoints

## Masalah yang Ditemukan

Ketika administrator mengupdate Stellar API key di User Management, muncul **403 Forbidden** error:

```
POST /api/users/{userId}/stellar-key 403
GET /api/users/{userId}/stellar-key 403
```

## Root Cause

**Authorization logic error** di `app/api/users/[userId]/stellar-key/route.ts`

Endpoints mengecek permission `"manage_users"`:
```typescript
if (!hasPermission(currentUser.role, "manage_users")) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}
```

Tapi role `administrator` **tidak punya** permission `"manage_users"`. Role administrator punya permissions:
- `view_users`
- `create_user` 
- `update_user` ← Permission yang ada
- `delete_user`
- Dll

Permission `"manage_users"` tidak ada di dalam role administrator!

## Solusi

Ubah authorization checks dari `"manage_users"` → `"update_user"` di semua endpoints:

### GET Endpoint (Line 22)
```typescript
// BEFORE
if (!hasPermission(currentUser.role, "manage_users")) { }

// AFTER
if (!hasPermission(currentUser.role, "update_user")) { }
```

### POST Endpoint (Line 75)
```typescript
// BEFORE
if (!hasPermission(currentUser.role, "manage_users")) { }

// AFTER
if (!hasPermission(currentUser.role, "update_user")) { }
```

### DELETE Endpoint (Line 138)
```typescript
// BEFORE
if (!hasPermission(currentUser.role, "manage_users")) { }

// AFTER
if (!hasPermission(currentUser.role, "update_user")) { }
```

## Files yang Diubah

✅ `app/api/users/[userId]/stellar-key/route.ts`
- Line 22: GET authorization
- Line 75: POST authorization  
- Line 138: DELETE authorization

## Verifikasi

Semua 3 endpoints sekarang menggunakan permission yang benar:
```
Line 22:  if (!hasPermission(currentUser.role, "update_user"))
Line 75:  if (!hasPermission(currentUser.role, "update_user"))
Line 138: if (!hasPermission(currentUser.role, "update_user"))
```

## Testing

Sekarang coba lagi:
1. Login sebagai administrator
2. Go to User Management → Edit User
3. Update Stellar API Key
4. Verify **tidak ada 403 error**, endpoint harus return 200

Expected hasil:
```
✅ PUT /api/auth/users/{userId} 200
✅ POST /api/users/{userId}/stellar-key 200  ← Sebelumnya 403
✅ GET /api/users/{userId}/stellar-key 200   ← Sebelumnya 403
```

## Why This Fix is Correct

- ✅ Administrator punya permission `update_user` ✓
- ✅ Consistent dengan permissions yang sudah ada di system
- ✅ Logical: update user data = bisa update user's API key
- ✅ Secure: still restricted to administrators only
- ✅ Matches existing permission model

## Impact

- **Admin users**: Bisa sekarang update Stellar API key untuk users ✅
- **Regular users**: Tidak affected (masih pakai endpoint `/api/users/me/stellar-key`)
- **Security**: Same level of security, hanya fixed permission check

