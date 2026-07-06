import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { caseData, integrationSource, integrationName, alerts } = body

    if (!caseData) {
      return NextResponse.json({ success: false, error: "caseData is required" }, { status: 400 })
    }

    const apiKey = process.env.OPENROUTER_API_KEY
    const baseUrl = process.env.OPENROUTER_BASE_URL || "https://api.openai.com/v1"
    const model = process.env.OPENROUTER_MODEL || "gpt-4o-mini"

    if (!apiKey) {
      return NextResponse.json({ success: false, error: "OpenAI API key not configured" }, { status: 500 })
    }

    const systemPrompt = buildSystemPrompt()
    const userPrompt = buildUserPrompt(caseData, integrationSource, integrationName, alerts || [])

    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        max_completion_tokens: 2000,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[TicketDraft] OpenAI API error:", response.status, errorText)
      return NextResponse.json(
        { success: false, error: `LLM API error: ${response.status}` },
        { status: 500 }
      )
    }

    const result = await response.json()
    const draft = result.choices?.[0]?.message?.content?.trim() || ""

    return NextResponse.json({ success: true, data: { draft } })
  } catch (error) {
    console.error("[TicketDraft] Generate error:", error)
    return NextResponse.json({ success: false, error: "Failed to generate ticket draft" }, { status: 500 })
  }
}

function buildSystemPrompt(): string {
  return `Kamu adalah analis SOC (Security Operations Center) profesional yang bertugas membuat notifikasi tiket insiden keamanan kepada pelanggan.
Tugas kamu adalah membuat draft tiket notifikasi dalam Bahasa Indonesia yang formal dan informatif, mengikuti format standar SOC247.

Format output yang WAJIB digunakan (plain text, TANPA markdown):
Dear [NAMA CUSTOMER] Team,
[Paragraf pembuka singkat]

Alert Information:
• [Field]: [Nilai]
• ...

Alert / Incident Description:
[Narasi dalam bahasa Indonesia]

Risk Assessment:
[Analisis risiko]

Recommended Actions:
1. [Rekomendasi]
2. ...

Terima kasih.

Best regards,
SOC247

ATURAN WAJIB:
- Output harus berupa plain text murni. DILARANG menggunakan **bold**, *italic*, # heading, atau format markdown apapun.
- Judul section ditulis biasa tanpa tanda apapun, contoh: "Alert Information:" bukan "**Alert Information:**"
- Nama customer diturunkan dari nama integrasi (misal: "QRadar MSIG" → "MSIG", "Stellar Cyber TVRI" → "TVRI", "SOCFortress POS" → "POS")
- Nama customer TIDAK boleh diawali tanda "-" atau karakter lain; jika ada, buang tanda tersebut
- Gunakan "•" untuk bullet poin di Alert Information
- Gunakan "1. 2. 3." untuk Recommended Actions
- Ekstrak nilai field (Source IP, Agent IP, Target, Username, dll) dari raw data JSON yang diberikan. Jika kamu bisa menemukan nilainya di data meskipun di path berbeda, gunakan nilai tersebut. Tulis "Tidak tersedia" hanya jika benar-benar tidak ada di data sama sekali.
- Jangan tambahkan informasi yang tidak ada dalam data`
}

function buildUserPrompt(caseData: any, source: string, integrationName: string, alerts: any[]): string {
  const customerName = extractCustomerName(integrationName, source)
  const severity = caseData.severity || "Low"
  const caseName = caseData.name || caseData.title || "N/A"
  const caseId = caseData.ticketId || caseData.externalId || caseData.id
  const createdAt = caseData.createdAt || caseData.startTimestamp
  const totalAlerts = caseData.size || caseData.alertCount || alerts.length || 1

  // Sanitize case-level data
  const rawCaseData = sanitizeForPrompt(caseData)

  // Sanitize alert metadata (first 3 alerts max) — this is where srcip, username, etc. live
  const rawAlerts = alerts.slice(0, 3).map((a) => sanitizeForPrompt(a))

  const detectedTime = createdAt
    ? new Date(createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
    : "Tidak tersedia"

  if (source === "qradar") {
    return `Lengkapi draft tiket SOC247 berikut. Isi semua bagian [FILL_FROM_DATA] dengan nilai yang kamu temukan dari raw data JSON yang diberikan. Tulis narasi untuk bagian deskripsi, risk assessment, dan recommended actions.

=== TEMPLATE OUTPUT (isi semua [FILL_FROM_DATA]) ===

Dear ${customerName} Team,
Kami menyampaikan notifikasi terkait aktivitas keamanan mencurigakan yang terdeteksi oleh SIEM, dengan detail sebagai berikut:

Alert Information:
• Offense ID: ${caseId}
• Offense Name: ${caseName}
• Detected Date and Time: ${detectedTime}
• Source IP: [FILL_FROM_DATA — cek field: srcip, source_ip, sourceIps, sourceip, ClientIP, ActorIpAddress, ipAddress]
• Username: [FILL_FROM_DATA — cek field: username, UserId, srcip_username, user, userName, accountName]
• Total Alerts: ${totalAlerts}
• Risk / Severity Level: ${severity}

Alert / Incident Description:
[Tulis narasi dalam Bahasa Indonesia yang menjelaskan apa yang terjadi berdasarkan nama offense dan data]

Risk Assessment:
[Tulis analisis risiko dalam Bahasa Indonesia]

Recommended Actions:
1. [Rekomendasi spesifik sesuai jenis insiden]
2. [Rekomendasi]

Terima kasih.

Best regards,
SOC247
=== END TEMPLATE ===

Raw data case (JSON):
${JSON.stringify(rawCaseData, null, 2)}

Raw data alerts (JSON):
${JSON.stringify(rawAlerts, null, 2)}

PENTING: Output harus berupa plain text persis seperti template di atas — TANPA markdown, TANPA tanda **, TANPA #. Ganti semua [FILL_FROM_DATA] dengan nilai nyata dari raw data.`
  }

  if (source === "socfortress" || source === "copilot") {
    return `Lengkapi draft tiket SOC247 berikut. Isi semua bagian [FILL_FROM_DATA] dengan nilai yang kamu temukan dari raw data JSON yang diberikan. Tulis narasi untuk bagian deskripsi, risk assessment, dan recommended actions.

=== TEMPLATE OUTPUT (isi semua [FILL_FROM_DATA]) ===

Dear ${customerName} Team,
Kami menyampaikan notifikasi terkait aktivitas keamanan mencurigakan yang terdeteksi oleh SIEM, dengan detail sebagai berikut:

Alert Information:
• Case ID: ${caseId}
• Alert Name: ${caseName}
• Detected Date and Time: ${detectedTime}
• Source IP: [FILL_FROM_DATA — cek field: srcip, source_ip, ClientIP, ActorIpAddress, data.srcip, metadata.srcip, ipAddress]
• Agent IP: [FILL_FROM_DATA — cek field: agent.ip, agentIp, data.agent.ip, metadata.agent, manager.host, agentAddress] (Agent Name: [FILL_FROM_DATA — cek: agent.name, agentName, data.agent.name, manager.name, hostname])
• Target: [FILL_FROM_DATA — cek field: rule.description, target, data.full_log, location, path, syscheck.path, data.win.eventdata.targetObject]
• Total Alerts: ${totalAlerts}
• Risk / Severity Level: ${severity}

Alert / Incident Description:
[Tulis narasi dalam Bahasa Indonesia yang menjelaskan apa yang terjadi]

Risk Assessment:
[Tulis analisis risiko]

Current Status (SOC Action):
[Tulis tindakan yang sudah dilakukan SOC]

Recommended Actions:
1. [Rekomendasi spesifik]
2. [Rekomendasi]

Atas perhatian dan kerja samanya, kami ucapkan terima kasih.

Best regards,
SOC247
=== END TEMPLATE ===

Raw data case (JSON):
${JSON.stringify(rawCaseData, null, 2)}

Raw data alerts (JSON):
${JSON.stringify(rawAlerts, null, 2)}

PENTING: Output harus berupa plain text persis seperti template di atas — TANPA markdown, TANPA tanda **, TANPA #. Ganti semua [FILL_FROM_DATA] dengan nilai nyata dari raw data.`
  }

  // Stellar Cyber (default)
  const caseCreatedAt = caseData.createdAt || createdAt
  const caseCreatedTime = caseCreatedAt
    ? new Date(caseCreatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
    : "Tidak tersedia"

  return `Lengkapi draft tiket SOC247 berikut. Isi semua bagian [FILL_FROM_DATA] dengan nilai yang kamu temukan dari raw data JSON yang diberikan. Tulis narasi untuk bagian deskripsi, risk assessment, dan recommendation.

=== TEMPLATE OUTPUT (isi semua [FILL_FROM_DATA]) ===

Dear ${customerName} Team,
Kami mendeteksi adanya case ${caseName} dengan analisis sebagai berikut:

Alert Information:
• Case Name: ${caseName}
• Case ID: ${caseId}
• Time Alert Detection: ${detectedTime}
• Time Case Created: ${caseCreatedTime}
• Count of alerts: ${totalAlerts}
• Source IP/Host: [FILL_FROM_DATA — cek field: srcip, srcip_host, source_ip, ClientIP, ActorIpAddress, ipAddress. Sertakan nama host/device jika ada di field: srcip_host, hostname, device_name, hostName]
• Destination IP/Host: [FILL_FROM_DATA — cek field: dstip, dst_ip, dstip_host, destination_ip, destip. Tulis "Tidak tersedia" jika benar-benar tidak ada]
• Username: [FILL_FROM_DATA — cek field: username, UserId, srcip_username, user.email, user.name, wineventlog_user.email]
• Risk/Severity Level: ${severity}
• Potential Impact:
  1. [Dampak potensial 1 berdasarkan jenis insiden]
  2. [Dampak potensial 2]
  3. [Dampak potensial 3]

Alert / Incident Description:
[Tulis narasi dalam Bahasa Indonesia yang menjelaskan apa yang terjadi — gunakan IP, username, lokasi, dan detail teknis dari raw data]

Risk Assessment:
[Tulis analisis risiko dalam Bahasa Indonesia]

Recommendation:
1. [Rekomendasi spesifik]
2. [Rekomendasi]

Mohon dilakukan penanganan sesuai dengan rekomendasi yang kami berikan.

Demikian yang dapat kami sampaikan. Terima kasih.

Best Regards,
SOC 247
=== END TEMPLATE ===

Raw data case (JSON):
${JSON.stringify(rawCaseData, null, 2)}

Raw data alerts (JSON):
${JSON.stringify(rawAlerts, null, 2)}

PENTING: Output harus berupa plain text persis seperti template di atas — TANPA markdown, TANPA tanda **, TANPA #. Ganti semua [FILL_FROM_DATA] dengan nilai nyata dari raw data.`
}

function extractCustomerName(integrationName: string, source: string): string {
  if (!integrationName) return "Customer"
  let name = integrationName.trim()
  // Remove leading dashes or special chars
  name = name.replace(/^[-–—\s]+/, "").trim()
  // Remove common integration prefixes
  const prefixes = ["qradar", "stellar cyber", "stellar", "socfortress", "copilot", "wazuh"]
  for (const prefix of prefixes) {
    const regex = new RegExp(`^${prefix}[\\s-–]*`, "i")
    name = name.replace(regex, "").trim()
  }
  // Remove any remaining leading dashes
  name = name.replace(/^[-–—\s]+/, "").trim()
  return name || integrationName
}

/**
 * Remove heavy/irrelevant fields before sending to LLM to keep prompt size manageable.
 */
function sanitizeForPrompt(data: any, depth = 0): any {
  if (depth > 6) return "[...]"
  if (data === null || data === undefined) return data
  if (typeof data === "string") {
    // Truncate very long strings (e.g. base64, raw payloads)
    return data.length > 500 ? data.substring(0, 500) + "..." : data
  }
  if (Array.isArray(data)) {
    // Only keep first 5 items of arrays
    return data.slice(0, 5).map((item) => sanitizeForPrompt(item, depth + 1))
  }
  if (typeof data === "object") {
    const result: any = {}
    const skipKeys = ["password", "token", "secret", "key", "cert", "credential"]
    for (const [k, v] of Object.entries(data)) {
      if (skipKeys.some((sk) => k.toLowerCase().includes(sk))) continue
      result[k] = sanitizeForPrompt(v, depth + 1)
    }
    return result
  }
  return data
}

