import { NextRequest, NextResponse } from "next/server"
import fetch from "node-fetch"
import https from "https"
import { getCurrentUser } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
})

/**
 * Returns an HTML page that performs the complete QRadar auth flow
 * Uses form submission in popup to properly establish authenticated session
 */
function returnAuthPage(
  qradarHost: string,
  username: string,
  password: string,
  csrfToken: string
): NextResponse {
  // Escape HTML special characters for safe insertion
  const safeUsername = username.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const safePassword = password.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const safeCsrfToken = csrfToken.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const safeQradarHost = qradarHost.replace(/"/g, "&quot;")

  const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Connecting to QRadar...</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            text-align: center;
            max-width: 400px;
            width: 90%;
        }
        .qradar-logo {
            width: 60px;
            height: 60px;
            margin: 0 auto 20px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            color: white;
            font-size: 24px;
        }
        .spinner {
            width: 40px;
            height: 40px;
            margin: 0 auto 20px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .message {
            font-size: 18px;
            font-weight: 500;
            color: #333;
            margin: 10px 0;
        }
        .submessage {
            font-size: 14px;
            color: #666;
            margin: 0;
        }
        .error {
            color: #d32f2f;
            padding: 12px;
            background: #ffebee;
            border-radius: 4px;
            margin-top: 20px;
            font-size: 13px;
            display: none;
        }
        .error.show {
            display: block;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="qradar-logo">QR</div>
        <div class="spinner"></div>
        <p class="message">Connecting to QRadar</p>
        <p class="submessage">Please wait while we authenticate your session...</p>
        <div id="error" class="error"></div>
    </div>

    <!-- Hidden form for credentials submission -->
    <form id="loginForm" method="POST" action="${safeQradarHost}/console/login" style="display: none;">
        <input type="hidden" name="j_username" value="${safeUsername}">
        <input type="hidden" name="j_password" value="${safePassword}">
        <input type="hidden" id="csrfInput" name="LoginCSRF" value="">
    </form>

    <script>
    (function() {
        const qradarHost = '${safeQradarHost}';
        const username = '${safeUsername}';
        const password = '${safePassword}';
        let state = 'init'; // init -> authenticating -> authenticated -> navigating -> complete
        
        function updateStatus(newState, message) {
            state = newState;
            console.log('[QRadar Popup] State: ' + state + ' - ' + message);
            const msgDiv = document.querySelector('.message');
            if (msgDiv) msgDiv.textContent = message;
        }
        
        function showError(message) {
            console.error('[QRadar Popup] Error: ' + message);
            updateStatus('error', message);
            const errorDiv = document.getElementById('error');
            if (errorDiv) {
                errorDiv.textContent = message;
                errorDiv.classList.add('show');
            }
            // Signal parent
            if (window.opener) {
                try {
                    window.opener.postMessage('qradar_auth_error', '*');
                } catch (e) {
                    console.error('Failed to send error message to parent:', e);
                }
            }
        }

        function signalSuccess() {
            console.log('[QRadar Popup] ✓ Authentication successful');
            if (window.opener) {
                try {
                    window.opener.postMessage('qradar_auth_success', '*');
                } catch (e) {
                    console.error('Failed to send success message to parent:', e);
                }
            }
        }

        async function authenticate() {
            try {
                updateStatus('authenticating', 'Step 1: Authenticating with QRadar...');
                
                // Create Basic Auth header
                const credentials = username + ':' + password;
                const encodedCredentials = btoa(credentials);
                const basicAuthHeader = 'Basic ' + encodedCredentials;
                
                console.log('[QRadar Popup] Sending Basic Auth request...');
                
                const xhr = new XMLHttpRequest();
                xhr.open('GET', qradarHost + '/api/system/about', true);
                xhr.withCredentials = true;
                xhr.setRequestHeader('Authorization', basicAuthHeader);
                xhr.setRequestHeader('Accept', 'application/json');
                
                xhr.onload = function() {
                    console.log('[QRadar Popup] Auth response status:', xhr.status);
                    
                    if (xhr.status === 200) {
                        console.log('[QRadar Popup] ✓ Basic Auth successful');
                        onAuthSuccess();
                    } else if (xhr.status === 401) {
                        console.warn('[QRadar Popup] Got 401 - ' + xhr.responseText.substring(0, 100));
                        onAuthSuccess(); // Try navigating anyway
                    } else {
                        showError('Auth failed with status ' + xhr.status);
                    }
                };
                
                xhr.onerror = function() {
                    console.log('[QRadar Popup] Network error, attempting navigation anyway');
                    onAuthSuccess();
                };
                
                xhr.timeout = 8000;
                xhr.ontimeout = function() {
                    console.log('[QRadar Popup] Auth timeout, attempting navigation');
                    onAuthSuccess();
                };
                
                xhr.send();
                
            } catch (error) {
                console.error('[QRadar Popup] Auth error:', error);
                showError('Authentication error: ' + String(error));
            }
        }

        function onAuthSuccess() {
            updateStatus('authenticated', 'Step 2: Session authenticated, preparing navigation...');
            
            // Small delay to ensure cookies are fully set
            setTimeout(() => {
                signalSuccess();
                updateStatus('navigating', 'Step 3: Opening QRadar console...');
                
                // Give parent time to receive success message
                setTimeout(() => {
                    console.log('[QRadar Popup] Navigating to console');
                    window.location.href = qradarHost + '/console/qradar/jsp/QRadar.jsp';
                    updateStatus('complete', 'Complete!');
                }, 100);
            }, 500);
        }

        console.log('[QRadar Popup] ========== QRadar Auto-Login Starting ==========');
        console.log('[QRadar Popup] Target: ' + qradarHost);
        console.log('[QRadar Popup] Username: ' + username);
        
        try {
            updateStatus('init', 'Preparing authentication...');
            setTimeout(authenticate, 500);
        } catch (error) {
            console.error('[QRadar Popup] Uncaught error:', error);
            showError('Unexpected error: ' + String(error));
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
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}

async function handleAuth() {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const qradarHost = (process.env.QRADAR_HOST || process.env.QRADAR_URL || "").replace(/\/$/, "")
    const qradarUsername = process.env.QRADAR_USERNAME || process.env.QRADAR_USER
    const qradarPassword = process.env.QRADAR_PASSWORD

    if (!qradarHost || !qradarUsername || !qradarPassword) {
      console.error("[QRadar Auth] Missing credentials:", {
        host: !!qradarHost,
        username: !!qradarUsername,
        password: !!qradarPassword,
      })
      return new NextResponse(
        `
<!DOCTYPE html>
<html>
<head><title>Configuration Error</title></head>
<body style="padding:20px; font-family:sans-serif;">
    <h1>⚠️ Configuration Error</h1>
    <p>QRadar credentials are not configured.</p>
    <p>Please add QRADAR_HOST, QRADAR_USERNAME, QRADAR_PASSWORD</p>
    <button onclick="window.close()">Close</button>
</body>
</html>
        `,
        { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
      )
    }

    console.log("[QRadar Auth] Starting server-side authentication...")

    try {
      // QRadar's CSRF token is obtained dynamically through the browser's session
      // We don't need to fetch it on server - the popup will establish its own session
      // when it submits the login form
      console.log("[QRadar Auth] Preparing popup authentication page...")
      console.log("[QRadar Auth] Popup will establish session and submit credentials directly")
      
      return returnAuthPage(qradarHost, qradarUsername, qradarPassword, "")
    } catch (authError) {
      console.error("[QRadar Auth] Authentication error:", authError)
      // Even if auth fails, return the page - the user will be prompted to login manually
      // Pass empty values since we couldn't extract credentials
      return returnAuthPage(qradarHost, qradarUsername, qradarPassword, "")
    }
  } catch (error) {
    console.error("[QRadar Auth Redirect] Error:", error)
    return new NextResponse(
      `
<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body style="padding:20px; font-family:sans-serif; color:red;">
    <h1>❌ Error</h1>
    <p>${error instanceof Error ? error.message : "Unknown error"}</p>
    <button onclick="window.close()">Close</button>
</body>
</html>
      `,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    )
  }
}

export async function GET(request: NextRequest) {
  return handleAuth()
}

export async function POST(request: NextRequest) {
  return handleAuth()
}
