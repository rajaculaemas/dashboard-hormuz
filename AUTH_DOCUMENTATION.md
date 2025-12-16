# Authentication & Role-Based Access Control Documentation

## Overview

SOC Dashboard memiliki sistem autentikasi yang comprehensive dengan role-based access control (RBAC). Sistem ini mendukung 3 role utama dengan permission yang berbeda.

## Roles & Permissions

### 1. Administrator (Full Access)
- **Description**: Akses penuh ke semua fitur aplikasi
- **Permissions**:
  - View alerts
  - Update alert status
  - View cases
  - Create cases
  - Update cases
  - View integrations
  - Manage integrations (add/edit/delete)
  - View users
  - Create users
  - Update users
  - Delete users
  - Manage roles
  - System settings

### 2. Analyst (Moderate Access)
- **Description**: Dapat menganalisis alert dan membuat case, tapi tidak bisa manage user
- **Permissions**:
  - View alerts
  - Update alert status
  - View cases
  - Create cases
  - Update cases
  - View integrations
  - Tidak bisa manage user atau integrations

### 3. Read-Only (View Only)
- **Description**: Hanya bisa melihat, tidak bisa membuat perubahan
- **Permissions**:
  - View alerts
  - View cases
  - View integrations
  - Tidak bisa update status atau membuat case

## Default User

Sistem automatically membuat satu default admin user:

```
Email: admin@soc-dashboard.local
Password: admin123
Role: Administrator
```

**PENTING**: Ganti password ini setelah first login!

Untuk menggunakan custom admin password, set environment variable:
```bash
ADMIN_PASSWORD=your-secure-password
```

## Authentication Flow

### 1. Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@soc-dashboard.local",
  "password": "admin123"
}

Response:
{
  "success": true,
  "user": {
    "id": "user-id",
    "email": "admin@soc-dashboard.local",
    "name": "Administrator",
    "role": "administrator"
  }
}
```

HTTP-only cookie `authToken` akan di-set otomatis.

### 2. Logout
```bash
POST /api/auth/logout

Response:
{
  "success": true,
  "message": "Logged out successfully"
}
```

Cookie akan di-clear otomatis.

## User Management APIs

### Get All Users
```bash
GET /api/auth/users
Authorization: Bearer token (via cookie)

Response:
{
  "success": true,
  "users": [
    {
      "id": "user-id",
      "email": "user@example.com",
      "name": "User Name",
      "role": "analyst",
      "status": "active",
      "createdAt": "2025-12-06T10:00:00Z",
      "updatedAt": "2025-12-06T10:00:00Z"
    }
  ]
}
```

### Create New User
```bash
POST /api/auth/users
Authorization: Bearer token (requires administrator role)
Content-Type: application/json

{
  "email": "newuser@example.com",
  "name": "New User",
  "password": "secure-password",
  "role": "analyst"  // atau "administrator", "read-only"
}

Response:
{
  "success": true,
  "message": "User created successfully",
  "user": {
    "id": "new-user-id",
    "email": "newuser@example.com",
    "name": "New User",
    "role": "analyst",
    "status": "active",
    "createdAt": "2025-12-06T10:30:00Z"
  }
}
```

### Get User by ID
```bash
GET /api/auth/users/:userId
Authorization: Bearer token

Response:
{
  "success": true,
  "user": { ... }
}
```

### Update User
```bash
PUT /api/auth/users/:userId
Authorization: Bearer token (requires administrator role)
Content-Type: application/json

{
  "name": "Updated Name",
  "role": "analyst",
  "status": "active",
  "password": "new-password"  // optional
}

Response:
{
  "success": true,
  "message": "User updated successfully",
  "user": { ... }
}
```

### Delete User
```bash
DELETE /api/auth/users/:userId
Authorization: Bearer token (requires administrator role)

Response:
{
  "success": true,
  "message": "User deleted successfully"
}
```

## Security Features

### 1. Password Hashing
- Menggunakan PBKDF2 dengan SHA-512
- Salt random 16 bytes untuk setiap password
- 1000 iterations untuk hashing

### 2. JWT Tokens
- Expiration: 24 hours
- Signed dengan HS256
- Stored as HTTP-only cookie
- Secure flag enabled di production

### 3. Role-Based Access Control
- Setiap endpoint mengecek user role
- Permission-based authorization
- Automatic 403 response untuk unauthorized access

### 4. Password Requirements
- Minimal length dapat dikonfigurasi
- Stored as hashed value (never stored in plain text)
- Password harus diubah saat first login

## Usage Examples

### Create Analyst User
```bash
curl -X POST http://localhost:3000/api/auth/users \
  -H "Content-Type: application/json" \
  -b "authToken=<your-token>" \
  -d '{
    "email": "analyst@company.com",
    "name": "John Analyst",
    "password": "secure-password-123",
    "role": "analyst"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@soc-dashboard.local",
    "password": "admin123"
  }' \
  -c cookies.txt
```

### Access Protected Endpoint dengan Cookie
```bash
curl http://localhost:3000/api/auth/users \
  -b cookies.txt
```

## Role-Based Features in UI

Sistem akan automatically hide/show features berdasarkan user role:

- **Administrator**: Lihat menu Users, Settings, Integrations management
- **Analyst**: Lihat Create Case button, bisa update status
- **Read-Only**: Hanya bisa melihat, semua tombol action di-disable

## Middleware Integration

Untuk protect routes di Next.js app:

```typescript
// In middleware.ts
import { getCurrentUser } from '@/lib/auth/session'

export async function middleware(request: NextRequest) {
  const user = await getCurrentUser()
  
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  
  // Check specific role
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (user.role !== 'administrator') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*']
}
```

## Best Practices

1. **Change Default Password**: Immediately setelah first login
2. **Use HTTPS**: Set `NODE_ENV=production` untuk enable secure cookies
3. **Rotate Tokens**: Implement token refresh untuk long-lived sessions
4. **Audit Logging**: Track user activities untuk security compliance
5. **Regular Backups**: Backup user data secara regular

## Troubleshooting

### Login Error: "Invalid email or password"
- Verify email dan password yang benar
- Check jika user status adalah "active"
- Verify database connection

### Cookie Not Set
- Ensure `NODE_ENV` dikonfigurasi dengan benar
- Check browser cookie settings
- Verify HTTPS di production

### Role-Based Access Denied
- Verify user role adalah correct
- Check permission mapping di `lib/auth/password.ts`
- Ensure endpoint menggunakan `hasPermission()` check

## Future Enhancements

- [ ] Two-Factor Authentication (2FA)
- [ ] OAuth2 / SAML integration
- [ ] Password expiration policy
- [ ] Login attempt rate limiting
- [ ] Audit log untuk semua user activities
- [ ] Custom role creation
- [ ] Permission-level granularity
