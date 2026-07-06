import { NextRequest, NextResponse } from "next/server"
import fetch from "node-fetch"
import https from "https"

export const dynamic = "force-dynamic"

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
})

/**
 * DEBUG endpoint untuk test berbagai payload login ke Stellar Cyber
 * Endpoint ini memberitahu apa yang dikirim dan apa response-nya
 * 
 * Test payloads:
 * 1. Current payload (name, email, password, buildHash)
 * 2. Without email
 * 3. Without buildHash
 * 4. With username instead of name
 * 5. Different field combinations
 */
export async function POST(request: NextRequest) {
  try {
    const { testNumber = 1 } = await request.json()

    const stellarHost = process.env.STELLAR_CYBER_HOST || process.env.STELLAR_CYBER_URL
    const stellarUsername = process.env.STELLAR_CYBER_USERNAME || process.env.STELLAR_CYBER_USER
    const stellarPassword = process.env.STELLAR_CYBER_PASSWORD
    const stellarEmail = process.env.STELLAR_CYBER_EMAIL

    if (!stellarHost || !stellarUsername || !stellarPassword) {
      return NextResponse.json(
        { error: "Missing credentials" },
        { status: 500 }
      )
    }

    const loginUrl = `${stellarHost}/local/login/callback`
    
    // Different test payloads
    const payloads: Record<number, any> = {
      1: {
        name: stellarUsername,
        email: stellarEmail || `${stellarUsername}@stellar.local`,
        password: stellarPassword,
        buildHash: "",
      },
      2: {
        username: stellarUsername,
        email: stellarEmail || `${stellarUsername}@stellar.local`,
        password: stellarPassword,
        buildHash: "",
      },
      3: {
        name: stellarUsername,
        password: stellarPassword,
      },
      4: {
        username: stellarUsername,
        password: stellarPassword,
      },
      5: {
        user: stellarUsername,
        password: stellarPassword,
      },
      6: {
        name: stellarUsername,
        email: stellarEmail || `${stellarUsername}@stellar.local`,
        password: stellarPassword,
      },
      7: {
        email: stellarEmail || `${stellarUsername}@stellar.local`,
        password: stellarPassword,
      },
    }

    const payload = payloads[testNumber] || payloads[1]
    
    console.log(`\n[Debug Auth Test #${testNumber}] Testing payload:`, {
      ...payload,
      password: "***",
    })
    
    const testResponse = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      agent: httpsAgent as any,
      redirect: "manual",
    })

    const responseText = await testResponse.text()
    
    console.log(`[Debug Auth Test #${testNumber}] Status: ${testResponse.status}`)
    console.log(`[Debug Auth Test #${testNumber}] Response:`, responseText.substring(0, 500))

    // Parse response if JSON
    let responseData: any = responseText
    try {
      responseData = JSON.parse(responseText)
    } catch (e) {
      // Keep as text
    }

    return NextResponse.json({
      testNumber,
      payload: {
        ...payload,
        password: "***",
      },
      response: {
        status: testResponse.status,
        statusText: testResponse.statusText,
        data: responseData,
        headers: Object.fromEntries(
          Array.from(testResponse.headers.entries()).map(([k, v]) => [
            k,
            k.toLowerCase() === "set-cookie" ? "***" : v,
          ])
        ),
      },
    })
  } catch (error) {
    console.error("[Debug Auth Test] Error:", error)
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    )
  }
}
