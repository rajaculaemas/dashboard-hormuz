import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-this-in-production"
)

// Public paths yang tidak perlu authentication
const publicPaths = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/threat-intel/check-hash",
  "/api/telegram/polling-init", // Allow polling init without auth
  "/api/telegram/polling-stop", // Allow polling stop without auth
  "/api/health/telegram-polling", // Allow polling health check without auth
  "/api/cron/shift-recap", // Allow cron to trigger shift recap without auth (verified via x-cron-secret header)
  "/api/cron/escalation-timeout-check", // Allow cron to check escalation timeouts without auth (verified via x-cron-secret header)
]

// Middleware untuk menangani CORS dan authentication routing
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const origin = request.headers.get("origin") || "http://localhost:3000"

  // Skip middleware untuk public paths
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path))
  
  if (isPublicPath) {
    console.log(`[Middleware] Public path allowed: ${pathname}`)
    let response = NextResponse.next()
    // Add CORS headers untuk public API paths
    if (pathname.startsWith("/api/")) {
      response.headers.set("Access-Control-Allow-Origin", "*")
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
      response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
    }
    return response
  }

  // Allow internal background sync requests with special header (before token check)
  const isInternalSync = request.headers.get("x-internal-sync") === "true"
  if (isInternalSync && pathname.includes("/api/qradar/offenses/")) {
    console.debug(`[Middleware] Internal sync allowed: ${pathname}`)
    return NextResponse.next()
  }

  let response = NextResponse.next()

  // CORS headers untuk API - dengan credentials support
  if (pathname.startsWith("/api/")) {
    response = NextResponse.next()
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
    response.headers.set("Access-Control-Allow-Credentials", "true")
  }

  // Skip middleware untuk static files dan next internals
  if (pathname.startsWith("/_next") || pathname.startsWith("/images") || pathname === "/favicon.ico") {
    return response
  }

  // Check authentication untuk protected routes
  const token = request.cookies.get("authToken")?.value

  if (!token) {
    // Redirect ke login jika belum authenticated
    console.log(`[Auth Middleware] No token found for ${pathname}, redirecting to login`)
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // Verify token
  try {
    await jwtVerify(token, JWT_SECRET)
    return response
  } catch (error) {
    // Token invalid, redirect ke login
    console.log(`[Auth Middleware] Invalid token for ${pathname}, redirecting to login`, error)
    return NextResponse.redirect(new URL("/login", request.url))
  }
}

// Konfigurasi middleware untuk berjalan pada path tertentu
export const config = {
  matcher: [
    // Protect semua routes kecuali public paths
    "/((?!api/auth/login|api/auth/logout|api/auth/me|api/threat-intel/check-hash|login|_next|images|favicon).*)",
  ],
}
