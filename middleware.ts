import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-this-in-production"
)

// Public paths yang tidak perlu authentication
const publicPaths = ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/me", "/api/threat-intel/check-hash"]

// Middleware untuk menangani CORS dan authentication routing
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

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

  let response = NextResponse.next()

  // CORS headers untuk API
  if (pathname.startsWith("/api/")) {
    response = NextResponse.next()
    response.headers.set("Access-Control-Allow-Origin", "*")
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
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
