// lib/threat-intel/virustotal.ts
import axios from "axios"

const VIRUSTOTAL_API_KEY = process.env.VIRUSTOTAL_API_KEY || ""

export async function checkIpReputation(ioc: string): Promise<string> {
  if (!VIRUSTOTAL_API_KEY) return "API key VirusTotal belum dikonfigurasi."

  const headers = {
    "x-apikey": VIRUSTOTAL_API_KEY,
  }

  let endpoint = ""
  if (/^https?:\/\//.test(ioc)) {
    const urlId = Buffer.from(ioc).toString("base64").replace(/=+$/, "")
    endpoint = `https://www.virustotal.com/api/v3/urls/${urlId}`
  } else if (/^\b(?:\d{1,3}\.){3}\d{1,3}\b$/.test(ioc)) {
    endpoint = `https://www.virustotal.com/api/v3/ip_addresses/${ioc}`
  } else if (/^[a-fA-F0-9]{32,64}$/.test(ioc)) {
    endpoint = `https://www.virustotal.com/api/v3/files/${ioc}`
  } else {
    return `IOC ${ioc} tidak dikenali sebagai URL, IP, atau hash yang valid.`
  }

  try {
    const res = await axios.get(endpoint, { headers })
    const data = res.data?.data?.attributes

    if (!data) return `Tidak ada data intelijen untuk ${ioc} dari VirusTotal.`

    const malicious = data.last_analysis_stats?.malicious || 0
    const suspicious = data.last_analysis_stats?.suspicious || 0
    const harmless = data.last_analysis_stats?.harmless || 0

    return `?? **VirusTotal untuk ${ioc}**:\n- Malicious: ${malicious}\n- Suspicious: ${suspicious}\n- Harmless: ${harmless}`
  } catch (err: any) {
    return `Gagal mengakses VirusTotal untuk ${ioc}: ${err.message}`
  }
}

export async function checkWithVirusTotal(ioc: string): Promise<string> {
  return checkIpReputation(ioc)
}
