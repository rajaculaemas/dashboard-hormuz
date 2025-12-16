# Database Setup Guide

## Persyaratan
- PostgreSQL 12+ (local atau remote)
- Node.js 18+
- pnpm atau npm

## Quick Start

### 1. Setup PostgreSQL Database

#### Option A: Local PostgreSQL (macOS dengan Homebrew)
```bash
brew install postgresql@15
brew services start postgresql@15
createdb socdashboard
psql socdashboard
```

#### Option B: Local PostgreSQL (Ubuntu/Debian)
```bash
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo -u postgres createdb socdashboard
sudo -u postgres psql socdashboard
```

#### Option C: Using Docker
```bash
docker run --name soc-postgres \
  -e POSTGRES_USER=soc \
  -e POSTGRES_PASSWORD=punggawa \
  -e POSTGRES_DB=socdashboard \
  -p 5432:5432 \
  -d postgres:15
```

### 2. Verify Database Connection

```bash
# Check if PostgreSQL is running
psql -U soc -d socdashboard -h localhost -c "SELECT 1;"

# Should return:
#  ?column?
# ----------
#        1
```

### 3. Configure Environment

File `.env.local` sudah dikonfigurasi dengan:
```
DATABASE_URL="postgresql://soc:punggawa@localhost:5432/socdashboard?schema=public"
```

Jika Anda menggunakan setup berbeda:
- **Username**: ganti `soc` dengan username PostgreSQL Anda
- **Password**: ganti `punggawa` dengan password Anda
- **Host/Port**: ganti `localhost:5432` jika database berjalan di tempat lain
- **Database**: ganti `socdashboard` dengan nama database Anda

### 4. Create Database Tables

Jalankan script untuk membuat tables:
```bash
# Install dependencies jika belum
pnpm install

# Jalankan Prisma migration atau script manual
# Opsi 1: Gunakan Prisma (jika sudah dikonfigurasi)
pnpm prisma migrate dev

# Opsi 2: Jalankan script manual QRadar tables
pnpm tsx scripts/add-qradar-tables.ts
```

### 5. Start Development Server

```bash
pnpm dev
```

Server akan berjalan di `http://localhost:3000`

## Troubleshooting

### Error: "connect ECONNREFUSED 127.0.0.1:443"
- Database tidak terkoneksi
- Check: `DATABASE_URL` benar dan PostgreSQL berjalan di port 5432
- Jalankan: `psql -U soc -d socdashboard -h localhost -c "SELECT 1;"`

### Error: "role 'soc' does not exist"
```bash
# Create user jika belum ada
psql -U postgres -c "CREATE USER soc WITH PASSWORD 'punggawa';"
psql -U postgres -c "ALTER USER soc CREATEDB;"
```

### Error: "database 'socdashboard' does not exist"
```bash
psql -U postgres -c "CREATE DATABASE socdashboard OWNER soc;"
```

## Testing Database Connection from Node.js

```typescript
// test-db.ts
import { getSql } from "@/lib/db"

const sql = getSql()
const result = await sql`SELECT 1`
console.log("Database connected:", result)
```

## Production Setup (Neon PostgreSQL)

Untuk production, gunakan Neon PostgreSQL:

1. Login ke [Neon Console](https://console.neon.tech)
2. Buat project baru
3. Copy connection string dari Neon (mirip: `postgresql://user:pass@host:port/db`)
4. Set `DATABASE_URL` di production environment

```bash
# Vercel example
vercel env add DATABASE_URL
# Paste Neon connection string
```
