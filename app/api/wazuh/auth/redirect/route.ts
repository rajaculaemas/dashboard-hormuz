import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

const DISCOVER_PATH =
  "/app/data-explorer/discover#?_a=(discover:(columns:!(_source),isDirty:!f,sort:!()),metadata:(indexPattern:'wazuh-alerts-*',view:discover))&_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-24h,to:now))&_q=(filters:!(),query:(language:kuery,query:''))"

async function handleAuth() {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const wazuhHost = process.env.WAZUH_HOST
    if (!wazuhHost) {
      return NextResponse.json({ error: "Missing WAZUH_HOST" }, { status: 500 })
    }

    const username = process.env.WAZUH_USERNAME
    const password = process.env.WAZUH_PASSWORD
    if (!username || !password) {
      return NextResponse.json({ error: "Missing WAZUH credentials" }, { status: 500 })
    }

    const loginUrl = `${wazuhHost}/app/login`
    const discoverUrl = wazuhHost + DISCOVER_PATH
    console.log("[Wazuh Auth] Returning iframe-based auto-login HTML...")

    // Strategy: load Wazuh login page inside a hidden iframe, then use JS to fill & submit
    // the form — exactly how Playwright wazuh_screenshot.py does it.
    // The iframe is same-origin with Wazuh so JS can access its DOM freely.
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Authenticating to Wazuh...</title>
    <style>
        body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);}
        .box{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);padding:40px;border-radius:12px;text-align:center;backdrop-filter:blur(10px);}
        .ring{width:40px;height:40px;border-radius:50%;margin:0 auto 18px;border:3px solid rgba(255,255,255,.15);border-top-color:#4f9ef8;animation:spin 1s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg)}}
        .title{color:#e0e0e0;font-size:16px;font-weight:600;margin:6px 0;}
        .sub{color:#888;font-size:13px;margin:4px 0;}
    </style>
</head>
<body>
    <div class="box">
        <div class="ring"></div>
        <p class="title" id="status">Connecting to Wazuh...</p>
        <p class="sub" id="desc">Loading login page</p>
    </div>

    <!-- iframe loads Wazuh login; JS fills & submits form from same-origin context -->
    <iframe id="wazuhFrame" src="${loginUrl}"
        style="position:fixed;top:0;left:0;width:100%;height:100%;opacity:0;pointer-events:none;border:none;"
        sandbox="allow-same-origin allow-forms allow-scripts">
    </iframe>

    <script>
    (function(){
        var username = ${JSON.stringify(username)};
        var password = ${JSON.stringify(password)};
        var discoverUrl = ${JSON.stringify(discoverUrl)};
        var loginUrl = ${JSON.stringify(loginUrl)};

        var statusEl = document.getElementById('status');
        var descEl   = document.getElementById('desc');
        var frame    = document.getElementById('wazuhFrame');

        function goToDiscover() {
            statusEl.textContent = 'Authenticated!';
            descEl.textContent   = 'Opening Discover...';
            if (window.opener) window.opener.postMessage('wazuh_auth_success', '*');
            setTimeout(function(){ window.location.href = discoverUrl; }, 600);
        }

        frame.addEventListener('load', function onFirstLoad() {
            frame.removeEventListener('load', onFirstLoad);
            try {
                var doc = frame.contentDocument || frame.contentWindow.document;
                var frameUrl = frame.contentWindow.location.href;
                console.log('[Wazuh] iframe loaded:', frameUrl);

                // Already past login page = session was active
                if (!frameUrl.includes('/app/login')) {
                    console.log('[Wazuh] Already authenticated, going to Discover');
                    goToDiscover();
                    return;
                }

                // Find form elements — same selectors as Playwright script
                var userInput = doc.querySelector('input[placeholder*="Username" i]') ||
                                doc.querySelector('input[type="text"]');
                var passInput = doc.querySelector('input[placeholder*="Password" i]') ||
                                doc.querySelector('input[type="password"]');
                var submitBtn = doc.querySelector('button[type="submit"]') ||
                                doc.querySelector('button');

                if (!userInput || !passInput || !submitBtn) {
                    console.error('[Wazuh] Login form elements not found, showing page');
                    frame.style.opacity = '1';
                    frame.style.pointerEvents = 'auto';
                    document.querySelector('.box').style.display = 'none';
                    return;
                }

                statusEl.textContent = 'Signing in...';
                descEl.textContent   = 'Submitting credentials';

                // Fill credentials (mimics Playwright fill + React event dispatch)
                var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.frames[0].HTMLInputElement.prototype, 'value').set;
                nativeInputValueSetter.call(userInput, username);
                userInput.dispatchEvent(new frame.contentWindow.Event('input',  { bubbles: true }));
                userInput.dispatchEvent(new frame.contentWindow.Event('change', { bubbles: true }));

                nativeInputValueSetter.call(passInput, password);
                passInput.dispatchEvent(new frame.contentWindow.Event('input',  { bubbles: true }));
                passInput.dispatchEvent(new frame.contentWindow.Event('change', { bubbles: true }));

                // After submit, iframe will navigate — next load = success
                frame.addEventListener('load', function onAfterLogin() {
                    frame.removeEventListener('load', onAfterLogin);
                    console.log('[Wazuh] Post-login navigation detected, going to Discover');
                    goToDiscover();
                });

                setTimeout(function(){
                    console.log('[Wazuh] Clicking submit...');
                    submitBtn.click();
                }, 400);

            } catch(e) {
                // Cross-origin SecurityError = iframe successfully navigated to Wazuh domain
                // meaning auth worked and cookies are set
                console.log('[Wazuh] Cross-origin (expected), going to Discover. err:', e.message);
                goToDiscover();
            }
        });
    })();
    </script>
</body>
</html>`

    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  } catch (error) {
    console.error("[Wazuh Auth] Error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handleAuth()
}

export async function POST(request: NextRequest) {
  return handleAuth()
}
