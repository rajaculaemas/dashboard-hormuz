import { type NextRequest, NextResponse } from "next/server"
import axios from "axios"

const VIRUSTOTAL_API_KEY = process.env.VIRUSTOTAL_API_KEY || ""

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { ip } = body

    if (!ip) {
      return NextResponse.json(
        { success: false, error: "IP address is required" },
        { status: 400 }
      )
    }

    if (!VIRUSTOTAL_API_KEY) {
      return NextResponse.json(
        { success: false, error: "VirusTotal API key not configured" },
        { status: 500 }
      )
    }

    // Validate IP format
    const ipRegex = /^\b(?:\d{1,3}\.){3}\d{1,3}\b$/
    if (!ipRegex.test(ip)) {
      return NextResponse.json(
        { success: false, error: "Invalid IP address format" },
        { status: 400 }
      )
    }

    // Call VirusTotal API
    const endpoint = `https://www.virustotal.com/api/v3/ip_addresses/${ip}`
    const response = await axios.get(endpoint, {
      headers: {
        "x-apikey": VIRUSTOTAL_API_KEY,
      },
    })

    const data = response.data?.data?.attributes

    if (!data) {
      return NextResponse.json(
        { success: false, error: "No data available from VirusTotal" },
        { status: 404 }
      )
    }

    const stats = data.last_analysis_stats || {}

    return NextResponse.json({
      success: true,
      data: {
        malicious: stats.malicious || 0,
        suspicious: stats.suspicious || 0,
        harmless: stats.harmless || 0,
        undetected: stats.undetected || 0,
      },
      raw: data,
    })
  } catch (error: any) {
    console.error("Error checking IP reputation:", error)
    
    if (error.response?.status === 404) {
      return NextResponse.json(
        { success: false, error: "IP address not found in VirusTotal database" },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { 
        success: false, 
        error: error.message || "Failed to check IP reputation" 
      },
      { status: 500 }
    )
  }
}
