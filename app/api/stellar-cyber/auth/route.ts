import { NextRequest, NextResponse } from "next/server"
import fetch from "node-fetch"
import https from "https"
import CryptoJS from "crypto-js"
import { getCurrentUser } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
})

/**
 * Simple cookie jar for managing cookies across requests
 */
class SimpleCookieJar {
  private cookies: Record<string, string> = {}

  extractFromHeaders(headers: any): void {
    const setCookie = headers.get("set-cookie")
    if (setCookie) {
      // Parse Set-Cookie header format: name=value; Path=/; HttpOnly; Secure; SameSite=Strict
      const match = setCookie.match(/^([^=]+)=([^;]+)/)
      if (match) {
        this.cookies[match[1]] = match[2]
        console.log(`[Stellar Auth] Captured cookie: ${match[1]}`)
      }
    }
  }

  getCookieHeader(): string {
    return Object.entries(this.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join("; ")
  }

  hasCookies(): boolean {
    return Object.keys(this.cookies).length > 0
  }
}

/**
 * Encrypt password using CryptoJS (same library Stellar Cyber frontend uses)
 * This matches exactly what the browser encryption does
 */
function encryptPassword(password: string, buildHash: string): string {
  try {
    // CryptoJS.AES.encrypt handles:
    // - Random salt generation
    // - Key derivation (EVP_BytesToKey)
    // - AES-256-CBC encryption
    // - Base64 encoding with "Salted__" prefix
    // - All automatically!
    
    // Use buildHash as the encryption key/passphrase
    // CryptoJS will use OpenSSL EVP_BytesToKey to derive actual key from this
    const encrypted = CryptoJS.AES.encrypt(password, buildHash).toString()
    
    console.log("[Stellar Auth] Encryption details:", {
      passwordLength: password.length,
      buildHashUsedAsKey: buildHash,
      encryptedLength: encrypted.length,
      encryptedPrefix: encrypted.substring(0, 20) + "..."
    })
    
    return encrypted
  } catch (error) {
    console.error("[Stellar Auth] Error encrypting password with CryptoJS:", error)
    throw error
  }
}

/**
 * Backend endpoint untuk authenticate ke Stellar Cyber
 * Menggunakan credentials dari environment variables
 * Tidak memerlukan parameter - semuanya dari backend env
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Create cookie jar for managing cookies across all requests
    const cookieJar = new SimpleCookieJar()

    // Get credentials from environment
    const stellarHost = process.env.STELLAR_CYBER_HOST || process.env.STELLAR_CYBER_URL
    const stellarUsername = process.env.STELLAR_CYBER_USERNAME || process.env.STELLAR_CYBER_USER
    const stellarPassword = process.env.STELLAR_CYBER_PASSWORD
    const stellarEmail = process.env.STELLAR_CYBER_EMAIL

    if (!stellarHost || !stellarUsername || !stellarPassword) {
      console.error("[Stellar Auth] Missing credentials in environment")
      return NextResponse.json(
        {
          error: "Missing Stellar Cyber credentials",
          details: "Please configure STELLAR_CYBER_HOST, STELLAR_CYBER_USERNAME, and STELLAR_CYBER_PASSWORD in environment variables",
        },
        { status: 500 }
      )
    }

    console.log("[Stellar Auth] Authenticating to Stellar Cyber...")
    console.log(`[Stellar Auth] Host: ${stellarHost}, Username: ${stellarUsername}`)

    // Step 0: Initialize session by loading login page
    console.log(`[Stellar Auth] Step 0: Initializing session by loading login page...`)
    const loginPageUrl = `${stellarHost}/login`
    try {
      const pageResponse = await fetch(loginPageUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        },
        agent: httpsAgent as any,
        redirect: "follow",
      })
      console.log("[Stellar Auth] Step 0 - Login page loaded, status:", pageResponse.status)
      
      const pageSetCookie = pageResponse.headers.get("set-cookie")
      console.log("[Stellar Auth] Step 0 - Set-Cookie header:", pageSetCookie ? "YES" : "NO")
      
      // Capture any cookies set during page load
      cookieJar.extractFromHeaders(pageResponse.headers)
      console.log("[Stellar Auth] Step 0 - Cookies in jar:", cookieJar.hasCookies() ? "YES" : "NO")
    } catch (pageError) {
      console.warn("[Stellar Auth] Step 0 - Failed to load initial login page, continuing:", pageError)
    }

    // Step 1: Get login strategy and buildHash
    const loginStrategyUrl = `${stellarHost}/auth/get_user_login_strategy`
    console.log(`[Stellar Auth] Step 1: Getting login strategy from ${loginStrategyUrl}`)

    const strategyResponse = await fetch(loginStrategyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...(cookieJar.hasCookies() ? { "Cookie": cookieJar.getCookieHeader() } : {}),
      },
      body: JSON.stringify({ username: stellarUsername }),
      agent: httpsAgent as any,
    })

    if (!strategyResponse.ok) {
      const error = await strategyResponse.text()
      console.error(`[Stellar Auth] Step 1 - Failed to get login strategy: ${strategyResponse.status}`, error)
      return NextResponse.json(
        { error: "Failed to get login strategy from Stellar Cyber" },
        { status: 502 }
      )
    }

    // Capture cookies from Step 1
    const stratSetCookie = strategyResponse.headers.get("set-cookie")
    console.log("[Stellar Auth] Step 1 - Set-Cookie header:", stratSetCookie ? "YES" : "NO")
    cookieJar.extractFromHeaders(strategyResponse.headers)
    console.log("[Stellar Auth] Step 1 - Total cookies in jar:", cookieJar.hasCookies() ? "YES" : "NO")

    const strategyData = (await strategyResponse.json()) as any
    console.log("[Stellar Auth] Login strategy:", strategyData.login_strategy)
    console.log("[Stellar Auth] Received user info:", {
      name: strategyData.name,
      email: strategyData.email,
      session_timeout: strategyData.session_timeout
    })

    if (strategyData.login_strategy !== "local") {
      return NextResponse.json(
        { error: `Unsupported login strategy: ${strategyData.login_strategy}. Only 'local' is supported.` },
        { status: 400 }
      )
    }

    // Get buildHash from Step 1 response
    let buildHash = strategyData.buildHash || "9ec3aeee" // Default fallback
    console.log("[Stellar Auth] Using buildHash:", buildHash)

    // Step 2: Encrypt password
    console.log("[Stellar Auth] Encrypting password with buildHash...")
    let encryptedPassword: string
    try {
      encryptedPassword = encryptPassword(stellarPassword, buildHash)
      console.log("[Stellar Auth] Password encrypted successfully")
    } catch (error) {
      console.error("[Stellar Auth] Failed to encrypt password:", error)
      return NextResponse.json(
        { error: "Failed to encrypt password", details: String(error) },
        { status: 500 }
      )
    }

    // Step 3: Authenticate with encrypted credentials
    const loginUrl = `${stellarHost}/local/login/callback`
    console.log(`[Stellar Auth] Step 3: Authenticating with encrypted password to ${loginUrl}`)

    const loginPayload = {
      name: strategyData.name || stellarUsername,
      email: strategyData.email || stellarEmail || `${stellarUsername}@stellar.local`,
      password: encryptedPassword,
      buildHash: buildHash,
    }

    console.log("[Stellar Auth] Sending login payload:", {
      name: loginPayload.name,
      email: loginPayload.email,
      password: encryptedPassword.substring(0, 50) + "...",
      buildHash: loginPayload.buildHash,
      hasCookies: cookieJar.hasCookies(),
    })

    const loginResponse = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...(cookieJar.hasCookies() ? { "Cookie": cookieJar.getCookieHeader() } : {}),
      },
      body: JSON.stringify(loginPayload),
      agent: httpsAgent as any,
      redirect: "follow",
    })

    console.log(`[Stellar Auth] Login response status: ${loginResponse.status}`)
    console.log(`[Stellar Auth] Final response URL after redirects: ${loginResponse.url}`)
    
    // Capture session cookie from login response
    cookieJar.extractFromHeaders(loginResponse.headers)
    
    // Log ALL response headers for debugging
    const responseHeaders: Record<string, string> = {}
    loginResponse.headers.forEach((value, key) => {
      responseHeaders[key] = key.toLowerCase() === 'set-cookie' ? '***' : value
    })
    console.log("[Stellar Auth] Final response headers:", JSON.stringify(responseHeaders, null, 2))

    // Get session cookie from response headers
    const setCookieHeader = loginResponse.headers.get("set-cookie")
    console.log("[Stellar Auth] Set-Cookie header present:", !!setCookieHeader)

    // Read response body - log VERY DETAILED for debugging
    const responseText = await loginResponse.text()
    console.log(`[Stellar Auth] Response body length: ${responseText.length} chars`)
    console.log(`[Stellar Auth] Response body:`, responseText)

    if (!loginResponse.ok) {
      console.error(`[Stellar Auth] Login failed: ${loginResponse.status}`, responseText)
      
      // Try to parse error response
      let errorMessage = "Authentication failed"
      let errorDetail = responseText
      
      try {
        const errorJson = JSON.parse(responseText)
        errorMessage = errorJson.error || errorMessage
        errorDetail = errorJson.error || responseText
        
        // If it's a version sync error, provide more helpful message
        if (errorMessage.includes("Software version") || errorJson.reload) {
          console.log("[Stellar Auth] Detected temporary software version sync error")
          return NextResponse.json(
            {
              error: "Stellar Cyber is updating",
              details: "Stellar Cyber is currently syncing software versions. This is usually a quick process (1-5 minutes). Please wait a few moments and try again.",
              isTemporaryError: true,
              originalError: errorMessage,
              recommendation: "Retry after 5-10 seconds"
            },
            { status: 503 }
          )
        }
      } catch (e) {
        // If not JSON, keep the text as detail
        console.log("[Stellar Auth] Error body is not JSON:", responseText.substring(0, 100))
      }
      
      return NextResponse.json(
        { 
          error: errorMessage, 
          details: errorDetail,
          isTemporaryError: false 
        },
        { status: 502 }
      )
    }

    // Try to parse response as JSON
    console.log("[Stellar Auth] Attempting to parse response as JSON...")
    let loginData: any = {}
    try {
      loginData = JSON.parse(responseText)
      console.log("[Stellar Auth] Successfully parsed JSON response data")
    } catch (e) {
      console.warn("[Stellar Auth] Could not parse response as JSON, treating as text")
      loginData = { data: {} }
    }

    console.log("[Stellar Auth] Login successful")
    console.log("[Stellar Auth] User ID:", loginData?.data?.user_id)
    console.log("[Stellar Auth] Full response data:", JSON.stringify(loginData, null, 2))

    // Return success with session info and threat hunting redirect URL
    return NextResponse.json(
      {
        success: true,
        data: {
          user: {
            id: loginData?.data?.user_id,
            name: loginData?.data?.name,
            email: loginData?.data?.email,
          },
          sessionCookie: setCookieHeader || undefined,
          // Return a redirect URL to go to threat hunting
          // The frontend should navigate to this URL using window.location or similar
          threatHuntingUrl: `${stellarHost}/investigate/threat-hunting/search`,
        },
      },
      {
        status: 200,
        headers: setCookieHeader ? { "Set-Cookie": setCookieHeader } : {},
      }
    )
  } catch (error) {
    console.error("[Stellar Auth] Error:", error)
    return NextResponse.json(
      {
        error: "Authentication error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
