import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { query_text, source_type } = body

    if (!query_text) {
      return NextResponse.json({ success: false, error: "query_text is required" }, { status: 400 })
    }

    const baseUrl = process.env.LLM_BASE_URL
    const apiKey = process.env.LLM_API_KEY

    const missing: string[] = []
    if (!baseUrl) missing.push("LLM_BASE_URL")
    if (!apiKey) missing.push("LLM_API_KEY")

    if (missing.length > 0) {
      const msg = `LLM service not configured. Missing env: ${missing.join(", ")}. Add them to .env.local and restart the dev server.`
      // In development, return a harmless mock response so UI can be exercised without a live LLM.
      if (process.env.NODE_ENV !== "production") {
        return NextResponse.json({ success: true, data: { mock: true, message: msg, query: query_text } })
      }
      return NextResponse.json({ success: false, error: msg }, { status: 500 })
    }

    const url = `${baseUrl.replace(/\/$/, "")}/query`

    // Allow adding extra options for upstream LLM (e.g., max_tokens, stop, stream)
    let upstreamBody: any = { query_text, source_type }
    if (process.env.LLM_EXTRA_OPTIONS) {
      try {
        const extras = JSON.parse(process.env.LLM_EXTRA_OPTIONS)
        upstreamBody = { ...upstreamBody, ...extras }
      } catch (e) {
        console.warn('LLM_EXTRA_OPTIONS parse failed, ignoring')
      }
    }

    // Auto-inject large max token variants if none provided, to reduce truncation risk.
    const tokenKeys = [
      "max_tokens",
      "max_output_tokens",
      "max_new_tokens",
      "response_max_tokens",
      "max_response_tokens",
    ]
    const hasTokenKey = tokenKeys.some((k) => Object.prototype.hasOwnProperty.call(upstreamBody, k))
    if (!hasTokenKey) {
      // set a high default; user can override with LLM_EXTRA_OPTIONS
      const big = 20000
      upstreamBody = { ...upstreamBody, max_tokens: big, max_output_tokens: big, max_new_tokens: big }
    }

    // Default to streaming if not explicitly disabled
    if (upstreamBody.stream === undefined) upstreamBody.stream = true

    const enableLogging = !!process.env.LLM_PROXY_LOG
    if (enableLogging) {
      const sample = String(query_text || "").slice(0, 1000)
      console.debug("[AI Proxy] upstream request → url=", url)
      console.debug("[AI Proxy] upstream body (truncated)=", { query_text_sample: sample, has_extra_keys: Object.keys(upstreamBody).length })
    }

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify(upstreamBody),
    })

    if (enableLogging) {
      try {
        // Log headers except Authorization
        const headersObj: Record<string, string> = {}
        resp.headers.forEach((v, k) => {
          if (k.toLowerCase() === "authorization") return
          headersObj[k] = v
        })
        console.debug("[AI Proxy] upstream response status=", resp.status, "headers=", headersObj)
        // clone and read up to 2000 chars for inspection
        const clone = resp.clone()
        const textPreview = (await clone.text()).slice(0, 2000)
        console.debug("[AI Proxy] upstream response preview (first 2000 chars)=", textPreview)
      } catch (e) {
        console.warn("[AI Proxy] failed to log upstream response preview", e)
      }
    }

    // If the upstream returned JSON, proxy as JSON so client can parse structured response
    const contentType = resp.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
      const json = await resp.json()
      return NextResponse.json({ success: true, data: json })
    }

    // If upstream returned a streaming/text response, stream it through to the client.
    // resp.body is a ReadableStream in modern runtimes; forward it directly.
    const respBody = resp.body
    if (respBody) {
      const headers: Record<string, string> = {
        "Content-Type": contentType || "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      }
      return new Response(respBody, { status: resp.status, headers })
    }

    // Fallback: read as text
    const text = await resp.text()
    return NextResponse.json({ success: true, data: text })
  } catch (error) {
    console.error("AI query error:", error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
