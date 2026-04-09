# Stellar Cyber API Key UI Implementation

## Overview
Added Stellar Cyber API key input fields to both the **User Profile** and **Admin User Management** pages, allowing users and administrators to manage their Stellar API credentials directly from the dashboard.

## Changes Made

### 1. User Profile Page (`app/dashboard/profile/page.tsx`)

#### Added State Management
```typescript
const [formData, setFormData] = useState({
  // ... existing fields
  stellarCyberApiKey: '',  // NEW
});
const [stellarKeyStatus, setStellarKeyStatus] = useState<{ hasKey: boolean } | null>(null);  // NEW
const [savingApiKey, setSavingApiKey] = useState(false);  // NEW
```

#### Added Stellar API Key Status Check
- When profile loads, fetches from `/api/users/me/stellar-key` to check if user has API key configured
- Displays status indicator (green for configured, yellow for not configured)

#### Added Stellar API Key Saving Logic
- When user saves profile, checks if Stellar API key was entered
- If provided, sends POST request to `/api/users/me/stellar-key` with the API key
- Shows success/warning toast notification based on result

#### Added UI Form Field
In the Edit Profile dialog:
- **Location**: Between user info and password change section
- **Elements**:
  - Status indicator (green checkmark if configured, yellow warning if not)
  - Input field with type="password" for secure entry
  - Helper text: "Leave empty to keep your current key"
- **Behavior**:
  - Displays current configuration status
  - Allows adding or updating API key
  - Optional field (doesn't block profile update)

### 2. Admin User Management Page (`app/dashboard/admin/page.tsx`)

#### Added State Management
```typescript
const [formData, setFormData] = useState({
  // ... existing fields
  stellarCyberApiKey: '',  // NEW
});
const [userStellarKeys, setUserStellarKeys] = useState<{ [key: string]: boolean }>({});  // NEW
```

#### Added Stellar API Key Status Fetching
- When fetching all users, also fetches Stellar API key status for each user
- Stores status in `userStellarKeys` object with format `{ userId: hasKey }`
- Gracefully handles errors (assumes false if fetch fails)

#### Added Stellar API Key Saving Logic in handleSubmit
- When editing user, checks if Stellar API key was entered
- If provided, sends POST request to `/api/users/{userId}/stellar-key` with the API key
- Shows warning toast if save fails (doesn't block user update)
- Includes reset of `stellarCyberApiKey` field after successful save

#### Added UI Form Field
In the Edit User dialog (only shown when editing, not when creating):
- **Location**: Between Role selector and Assigned Integrations section
- **Visibility**: Only appears when `editingUser` is set (i.e., during edit operations)
- **Elements**:
  - Section title: "Stellar Cyber API Key"
  - Status indicator showing:
    - Green box with checkmark if user has API key
    - Yellow box with warning if user doesn't have API key
  - Input field with type="password" for secure entry
  - Helper text: "Leave empty to keep current key"
- **Behavior**:
  - Shows current configuration status for the user being edited
  - Allows admins to add/update user's Stellar API key
  - Optional field (doesn't block user update)

## API Endpoints Used

### Profile Page
- **GET** `/api/users/me/stellar-key` - Check if current user has API key
- **POST** `/api/users/me/stellar-key` - Save/update current user's API key

### Admin Page
- **GET** `/api/users/{userId}/stellar-key` - Check if specific user has API key
- **POST** `/api/users/{userId}/stellar-key` - Save/update specific user's API key

## User Experience

### For Regular Users (Profile Page)
1. Click "Edit Profile" button
2. Scroll to "Stellar Cyber API Key" section
3. See status indicator (configured or not configured)
4. Optionally enter/update API key
5. Click "Update" to save
6. If Stellar key provided, system saves it and shows confirmation
7. API key is masked as password input for security

### For Administrators (Admin User Management)
1. Click "Edit User" button on any user row
2. Scroll to "Stellar Cyber API Key" section (appears below Role, above Integrations)
3. See status indicator for that user
4. Optionally enter/update user's API key
5. Click "Update" to save user changes and Stellar key
6. System confirms key save separately from user update
7. API key is masked as password input for security

## Security Features

1. **Password Input Type**: API keys are entered using `type="password"` to mask characters during input
2. **Optional Field**: Users are not required to enter API key during profile/user updates
3. **Separate Endpoint**: Stellar API keys are stored separately from other user data
4. **Leave Empty to Keep**: Clear instruction that empty field preserves existing key
5. **Admin Can Manage**: Admins can set/update API keys for any user without user password

## Status Indicators

### Profile Page
- **Green Indicator**: ✓ Stellar Cyber API Key is configured
- **Yellow Indicator**: No Stellar Cyber API Key configured. Add one to update alert/case status in Stellar Cyber.

### Admin Page
- **Green Indicator**: ✓ User has Stellar Cyber API Key configured
- **Yellow Indicator**: No Stellar Cyber API Key configured for this user

## Error Handling

1. If Stellar key save fails during profile update:
   - Shows warning toast with error message
   - Main profile update may have succeeded
   - User can retry saving API key

2. If Stellar key fetch fails during admin page load:
   - Assumes user doesn't have API key
   - Continues loading user list normally
   - Field still available for adding key

## Testing Checklist

- [ ] User can view Stellar API key status in profile
- [ ] User can add/update Stellar API key from profile
- [ ] Profile saves successfully with or without API key
- [ ] Admin can view Stellar API key status for users
- [ ] Admin can add/update API key for any user
- [ ] User update succeeds even if API key save fails
- [ ] Empty API key field doesn't overwrite existing key
- [ ] Password input properly masks entered text
- [ ] Status indicators update after save
- [ ] Toast notifications show appropriate messages
- [ ] Forms reset properly after dialog closes

## Files Modified

1. `/home/soc/soc-dashboard/app/dashboard/profile/page.tsx`
   - Added state management for Stellar API key
   - Added API key status checking
   - Added API key saving logic
   - Added UI form field

2. `/home/soc/soc-dashboard/app/dashboard/admin/page.tsx`
   - Added state management for Stellar API keys
   - Added API key status fetching for all users
   - Added API key saving logic in user update
   - Added UI form field in edit dialog

## Integration with Backend

The UI integrates with existing backend APIs:
- Backend endpoints created in previous implementation
- Helper functions available in `lib/api/user-stellar-credentials.ts`
- Database field `stellarCyberApiKey` already in User schema
- Migration already deployed

## Next Steps

1. Test UI functionality in browser
2. Verify API key saving works end-to-end
3. Confirm status indicators update correctly
4. Test error scenarios (network failures, etc.)
5. Validate security (password masking, etc.)
6. User acceptance testing
