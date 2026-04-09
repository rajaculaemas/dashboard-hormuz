# Stellar Cyber JWT API Key Check - Debugging Guide

## What I've Implemented

I've made several improvements to help you debug and fix the Stellar Cyber JWT API key detection:

### 1. **Improved Auto-Retry Logic**
- Dialog now re-checks JWT key every 1 second (was 2 seconds)
- Maximum of 30 attempts = up to 30 seconds of checking
- Automatically stops once key is found or max attempts reached
- "Verify Again" button resets attempts and re-checks immediately

### 2. **Better Logging in Browser Console**
When you open the dialog, check your browser DevTools console (F12) for logs starting with `[Stellar Dialog]`:

```
[Stellar Dialog] Dialog opened, resetting recheck attempts
[Stellar Dialog] Checking JWT key for user: "abc123xyz..."
[Stellar Dialog] Calling endpoint: /api/users/abc123xyz.../stellar-key
[Stellar Dialog] JWT check response: {status: 200, ok: true, hasKey: true, ...}
[Stellar Dialog] ✓ JWT key found! Form will be enabled.
```

### 3. **Enhanced Server-Side Logging**
The API endpoint now logs debugging info. Check terminal/server logs for `[Stellar Key Check]`:

```
[Stellar Key Check] Checking JWT key for user: abc123xyz...
[Stellar Key Check] Result for user abc123xyz...: {
  hasKey: true,
  keyLength: 256,
  keyTrimmed: 256
}
```

## Testing Steps

### Step 1: Clear Any Active Sessions
1. Open browser DevTools (F12)
2. Go to Application tab → Cookies
3. Delete the `authToken` cookie
4. Refresh page and login again

### Step 2: Test the JWT Key Configuration
1. Go to `/dashboard/profile`
2. Scroll to "Stellar Cyber API Key" section
3. Paste your Stellar Cyber JWT API key in the input field
4. Click "Save Changes" button
5. You should see: "✓ Stellar Cyber API Key saved successfully"
6. Check the green box: "✓ Stellar Cyber API Key is configured"

### Step 3: Test the Dialog
1. Go back to `/dashboard` (Alert Panel)
2. Click "Update Status" on any Stellar Cyber alert
3. **IMPORTANT**: Open DevTools console (F12) and watch for `[Stellar Dialog]` logs
4. Expected behavior:
   - If JWT key exists → Form enables, you can update
   - If JWT key NOT found → Amber warning shows with "Go to Profile Settings" button

### Step 4: Debug If Form Still Shows Warning
If the amber warning still appears after setting JWT key:

1. **Check Browser Console** for these logs:
   - `[Stellar Dialog] ✓ JWT key found!` = Good, form should enable
   - `[Stellar Dialog] ✗ JWT key NOT found.` = Key wasn't found, debug below

2. **Check Server Logs** for these messages:
   - `[Stellar Key Check] Checking JWT key for user: ___`
   - `[Stellar Key Check] Result for user ___: { hasKey: true, ...}`

3. **If you see `hasKey: false` in logs**:
   - It means the key might not have been saved
   - Or there's a database issue
   - Run: `Check database for this user's stellar_cyber_api_key`

## Possible Issues & Solutions

### Issue 1: Warning Shows Despite Setting Key
**Symptom**: You add key in profile (green checkmark visible), but dialog still warns

**Solutions**:
- Wait 1-2 seconds and click "Verify Again" button → should auto-detect
- Close and reopen the dialog → triggers new check
- If still not working, see: Check browser console logs for detailed error

### Issue 2: Dialog Never Shows Form
**Symptom**: Just loading spinner keeps spinning, no form appears

**Solutions**:
- Check browser console for errors
- The "max attempts reached" after 30 seconds failsafe will show warning
- Click "Verify Again" to restart attempts

### Issue 3: Update Still Fails After JWT Key Found
**Symptom**: Form enables and you can fill it out, but submit button gives error

**Solutions**:
- Check browser console for API error message
- Check server logs for Stellar Cyber API call details
- Verify JWT key is valid format and not corrupted

## Quick Verification Commands

In browser console (F12), you can test manually:

```javascript
// Check current JWT status
fetch('/api/users/YOUR_USER_ID/stellar-key')
  .then(r => r.json())
  .then(d => console.log('JWT Status:', d))

// Replace YOUR_USER_ID with your actual user ID from auth
```

## File Changes Made

1. **`components/alert/stellar-cyber-alert-update-dialog.tsx`**
   - Added `recheckAttempts` state tracking
   - Changed check interval to 1 second
   - Added max attempt limit (30)
   - Enhanced all console logging
   - Dialog format shows attempt number

2. **`app/api/users/[userId]/stellar-key/route.ts`**
   - Added `[Stellar Key Check]` server logging
   - Logs key length and trimmed length for debugging
   - Logs permission checks

## Next Steps

After verifying JWT key works:

1. ✅ Confirm form appears when JWT key is set
2. ✅ Confirm update submission works
3. ⏭️ Then we'll add escalation mode (Update vs Escalate) to all dialogs

---

**IMPORTANT**: The dev server is running. After each change, the page should auto-refresh. If not, manually refresh (Ctrl+F5).
