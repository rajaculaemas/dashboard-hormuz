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
 * Returns an HTML page that performs the complete Stellar auth flow:
 * 1. Loads GET /login in hidden iframe to initialize session
 * 2. Submits auth form to POST /local/login/callback
 * Both happen in the popup browser context so cookies work properly
 */
function returnAuthPage(
  stellarHost: string,
  buildHash: string,
  password: string,
  username: string,
  email: string,
  strategyData: any
): NextResponse {
  const encryptedPassword = CryptoJS.AES.encrypt(password, buildHash).toString()

  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Connecting to Stellar Cyber...</title>
</head>
<body style="display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; background:#f5f5f5;">
    <div style="text-align:center;">
        <p style="font-size:18px; color:#333;">Connecting to Stellar Cyber...</p>
        <p style="font-size:14px; color:#666;">Step 1: Initializing session...</p>
    </div>

    <!-- Hidden form for authentication via POST -->
    <!-- NO target specified yet - will be set by JavaScript -->
    <form id="authForm" method="POST" action="${stellarHost}/local/login/callback" style="display:none;">
        <input type="hidden" name="name" value="${strategyData.name || username}">
        <input type="hidden" name="email" value="${strategyData.email || email}">
        <input type="hidden" name="password" value="${encryptedPassword}">
        <input type="hidden" name="buildHash" value="${buildHash}">
    </form>

    <script>
    (function() {
        try {
            const stellarHost = '${stellarHost}';
            console.log('[Popup Auth] Authenticating...');
            
            // Create a hidden iframe to submit the auth form
            // This ensures the form submission doesn't navigate the main popup window
            const authIframe = document.createElement('iframe');
            authIframe.name = 'auth_iframe_' + Date.now();
            authIframe.style.display = 'none';
            document.body.appendChild(authIframe);
            
            // Point form to the hidden iframe
            const form = document.getElementById('authForm');
            form.target = authIframe.name;
            
            // Submit the form to the iframe
            // The browser will set cookies in the popup context from the response
            form.submit();
            console.log('[Popup Auth] Form submitted to hidden iframe');
            
            // Wait for form submission to complete and cookies to be set
            // Then navigate the MAIN window to threat hunting
            setTimeout(() => {
                console.log('[Popup Auth] Sending success message to parent...');
                
                // Signal parent BEFORE navigating (so message isn't lost during page transition)
                if (window.opener) {
                    window.opener.postMessage('stellar_auth_success', '*');
                }
                
                // Give parent time to receive the message
                setTimeout(() => {
                    console.log('[Popup Auth] Navigating to threat hunting...');
                    const threatHuntingUrl = stellarHost + '/investigate/threat-hunting/search';
                    window.location.href = threatHuntingUrl;
                }, 100); // Small delay to ensure message is processed
                
            }, 1500); // Wait for form to process and cookies to be set
            
        } catch (error) {
            console.error('[Popup Auth] Error:', error);
            document.body.innerHTML = '<div style="color:red; padding:20px;"><p>Authentication failed:</p><p>' + error.message + '</p></div>';
            
            if (window.opener) {
                window.opener.postMessage('stellar_auth_error', '*');
            }
        }
    })();
    </script>
</body>
</html>
  `

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  })
}


/**
 * This endpoint performs Stellar Cyber authentication and then REDIRECTS the browser
 * This ensures the browser receives and stores the Set-Cookie header from Stellar Cyber
 * 
 * Accepts both GET and POST to support:
 * - GET: from window.location.href navigation
 * - POST: from form submissions
 */
async function handleAuth() {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const stellarHost = process.env.STELLAR_CYBER_HOST || process.env.STELLAR_CYBER_URL
    const stellarUsername = process.env.STELLAR_CYBER_USERNAME || process.env.STELLAR_CYBER_USER
    const stellarPassword = process.env.STELLAR_CYBER_PASSWORD
    const stellarEmail = process.env.STELLAR_CYBER_EMAIL

    if (!stellarHost || !stellarUsername || !stellarPassword) {
      return NextResponse.json(
        { error: "Missing Stellar Cyber credentials" },
        { status: 500 }
      )
    }

    console.log("[Stellar Auth Redirect] Starting authentication for redirect...")

    // Step 1: Get login strategy
    const strategyResponse = await fetch(`${stellarHost}/auth/get_user_login_strategy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: JSON.stringify({ username: stellarUsername }),
      agent: httpsAgent as any,
    })

    if (!strategyResponse.ok) {
      console.error("[Stellar Auth Redirect] Failed to get login strategy")
      return NextResponse.json({ error: "Failed to authenticate" }, { status: 502 })
    }

    const strategyData = (await strategyResponse.json()) as any
    const buildHash = strategyData.buildHash || "9ec3aeee"

    // Step 2: Encrypt password using CryptoJS
    const encryptedPassword = CryptoJS.AES.encrypt(stellarPassword, buildHash).toString()

    // Step 3: Authenticate
    const loginPayload = {
      name: strategyData.name || stellarUsername,
      email: strategyData.email || stellarEmail || `${stellarUsername}@stellar.local`,
      password: encryptedPassword,
      buildHash: buildHash,
    }

    console.log("[Stellar Auth Redirect] Authenticating with encrypted password...")

    // DON'T follow redirects automatically - we need to handle them manually
    // to preserve the Set-Cookie header properly
    const loginResponse = await fetch(`${stellarHost}/local/login/callback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: JSON.stringify(loginPayload),
      agent: httpsAgent as any,
      // IMPORTANT: Don't follow redirects - we'll handle them
      redirect: "manual",
    })

    console.log("[Stellar Auth Redirect] Login response status:", loginResponse.status)

    // The response should be a redirect (302)
    if (loginResponse.status === 302 || loginResponse.status === 301) {
      const setCookieHeader = loginResponse.headers.get("set-cookie")
      const locationHeader = loginResponse.headers.get("location")

      console.log("[Stellar Auth Redirect] Got redirect response")
      console.log("[Stellar Auth Redirect] Set-Cookie:", setCookieHeader ? "YES" : "NO")
      console.log("[Stellar Auth Redirect] Location:", locationHeader || "NO")

      if (setCookieHeader && locationHeader) {
        // Return encrypted credentials for browser-side auth
        return returnAuthPage(
          stellarHost,
          buildHash,
          stellarPassword,
          stellarUsername,
          stellarEmail,
          strategyData
        )
      }
    }

    // If we get here, maybe the response was 200 (successful login without redirect)
    if (loginResponse.status === 200) {
      const setCookieHeader = loginResponse.headers.get("set-cookie")
      console.log("[Stellar Auth Redirect] Got 200 response, Set-Cookie:", setCookieHeader ? "YES" : "NO")

      if (setCookieHeader) {
        // Return encrypted credentials for browser-side auth
        return returnAuthPage(
          stellarHost,
          buildHash,
          stellarPassword,
          stellarUsername,
          stellarEmail,
          strategyData
        )
      }
    }

    console.error("[Stellar Auth Redirect] Unexpected login response status:", loginResponse.status)
    return NextResponse.json({ error: "Unexpected login response" }, { status: 502 })
  } catch (error) {
    console.error("[Stellar Auth Redirect] Error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return handleAuth()
}

export async function POST(request: NextRequest) {
  return handleAuth()
}
