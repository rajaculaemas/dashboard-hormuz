import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const { hash, type } = await req.json()
    if (!hash) {
      return NextResponse.json({ success: false, error: "No hash provided" }, { status: 400 })
    }

    console.log(`[check-hash] Received request: hash=${hash}, type=${type}`)

    const apiKey = process.env.VIRUSTOTAL_API_KEY
    if (!apiKey) {
      return NextResponse.json({ success: false, error: "VirusTotal API key not configured" }, { status: 500 })
    }

    const normalizedType = (type || "").toString().trim().toUpperCase()

    const fetchFileById = async (id: string) => {
      const url = `https://www.virustotal.com/api/v3/files/${encodeURIComponent(id)}`
      const vtRes = await fetch(url, {
        method: "GET",
        headers: {
          "x-apikey": apiKey,
          "accept": "application/json"
        }
      })
      return vtRes
    }

    const searchFile = async (query: string) => {
      const searchUrl = `https://www.virustotal.com/api/v3/search?query=${encodeURIComponent(query)}`
      const searchRes = await fetch(searchUrl, {
        method: "GET",
        headers: {
          "x-apikey": apiKey,
          "accept": "application/json"
        }
      })
      return searchRes
    }

    // Normalize hash: remove non-hex characters and whitespace
    const normalizeHex = (h: string) => {
      if (!h || typeof h !== 'string') return ''
      return h.replace(/[^A-Fa-f0-9]/g, '').toLowerCase()
    }

    const normHash = normalizeHex(hash)

    let vtRes: Response

    // Try direct lookup using the normalized hash first
    vtRes = await fetchFileById(normHash || hash)
    if (vtRes.status === 404) {
      // If direct lookup misses, try a broader search across md5/sha1/sha256 fields
      const queryParts = []
      if (normHash.length === 32) queryParts.push(`md5:${normHash}`)
      if (normHash.length === 40) queryParts.push(`sha1:${normHash}`)
      if (normHash.length === 64) queryParts.push(`sha256:${normHash}`)
      // Always add a generic fallback query so plain hash tokens are considered
      queryParts.push(normHash || hash)

      const fallbackQuery = queryParts.join(' OR ')
      const fallbackRes = await searchFile(fallbackQuery)
      if (fallbackRes.ok) {
        const searchData = await fallbackRes.json()
        const sha256 = searchData.data?.[0]?.id
        if (sha256) {
          vtRes = await fetchFileById(sha256)
        }
      }
    }

    if (!vtRes.ok) {
      const errorText = await vtRes.text()
      return NextResponse.json({ success: false, error: `VirusTotal error: ${errorText}` }, { status: vtRes.status })
    }

    const vtData = await vtRes.json()
    const stats = vtData.data?.attributes?.last_analysis_stats || {}
    console.log(`[check-hash] VT Response ID: ${vtData.data?.id}, original hash: ${hash}`)
    const result = {
      malicious: stats.malicious || 0,
      suspicious: stats.suspicious || 0,
      harmless: stats.harmless || 0,
      undetected: stats.undetected || 0,
      type: vtData.data?.type,
      hash: hash, // Return original hash user checked, not VT's ID
      virustotalHash: vtData.data?.id, // Also include VT's hash for reference
      details: vtData.data?.attributes || vtData.data
    }
    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || "Unknown error" }, { status: 500 })
  }
}
