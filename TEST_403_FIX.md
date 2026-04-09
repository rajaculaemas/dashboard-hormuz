# 🧪 Test: Stellar API Key Authorization Fix

## Langkah Testing

### 1. Restart Server
```bash
# Stop current server
# Then restart: pnpm dev
```

### 2. Test Admin Update Stellar Key

**Setup:**
- Login as administrator
- Go to: Dashboard → User Management
- Click "Edit" on any user

**Expected Result:**
- ✅ Edit User dialog opens
- ✅ Stellar Cyber API Key section visible
- ✅ Status indicator shows (green or yellow)
- ✅ Enter test API key
- ✅ Click "Update"

**Server Logs Should Show:**
```
PUT /api/auth/users/{userId} 200 ✅ (was: 200)
POST /api/users/{userId}/stellar-key 200 ✅ (was: 403 BEFORE FIX)
GET /api/users/{userId}/stellar-key 200 ✅ (was: 403 BEFORE FIX)
```

### 3. Test Page Reload

After successful update:
- Reload page: F5 or Cmd+R
- Admin page should load all users
- Should fetch each user's Stellar key status

**Server Logs Should Show:**
```
GET /api/auth/users 200 ✅
GET /api/users/{userId}/stellar-key 200 ✅ (was: 403 for each user)
GET /api/users/{userId}/stellar-key 200 ✅
... (for each user)
```

### 4. Verify Data Saved

After successful save:
- Edit same user again
- Check status indicator updated
- API key should be marked as "configured"

**Expected**: Green indicator ✓ "User has Stellar Cyber API Key configured"

## Success Criteria

| Check | Before Fix | After Fix |
|-------|-----------|-----------|
| User Management page loads | ✅ | ✅ |
| Fetch all users' key status | ❌ 403 | ✅ 200 |
| Edit user Stellar key | ❌ 403 | ✅ 200 |
| Save Stellar key | ❌ 403 | ✅ 200 |
| Status indicator updates | ❌ | ✅ |
| Delete Stellar key | ❌ 403 | ✅ 200 |

## Common Logs to Look For

### ✅ Good (After Fix)
```
GET /api/auth/users 200 in 28ms
GET /api/users/cmj8mi4ry0li0jwnx1hi84zsn/stellar-key 200 in 22ms
GET /api/users/cmj9gufm205u0jwwxcqs3wzcu/stellar-key 200 in 26ms
PUT /api/auth/users/cmj8mi4ry0li0jwnx1hi84zsn 200 in 99ms
POST /api/users/cmj8mi4ry0li0jwnx1hi84zsn/stellar-key 200 in 48ms
```

### ❌ Bad (Before Fix - What You Saw)
```
POST /api/users/cmj8mi4ry0li0jwnx1hi84zsn/stellar-key 403 in 48ms
GET /api/users/cmj8mi4ry0li0jwnx1hi84zsn/stellar-key 403 in 22ms
```

## Troubleshooting

**Still getting 403?**
- [ ] Did you restart the server after changes?
- [ ] Are you logged in as administrator?
- [ ] Check `/app/api/users/[userId]/stellar-key/route.ts` - verify all 3 lines use `"update_user"`

**Getting different error?**
- [ ] Check browser console for error messages
- [ ] Check server logs for stack trace
- [ ] Verify user session is valid (not expired)

## After Testing

Once you confirm it works:
1. ✅ No more 403 errors
2. ✅ Admin can update Stellar keys
3. ✅ Status indicators work correctly
4. Delete this file and the fix doc

