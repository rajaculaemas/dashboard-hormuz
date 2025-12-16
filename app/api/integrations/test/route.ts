import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { testStellarCyberConnection } from "@/lib/api/stellar-cyber-client"
import https from "https"

// POST /api/integrations/test - Menguji koneksi integrasi
export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    console.log("Testing integration with data:", {
      id: data.id || "not provided",
      source: data.source || "not provided",
      hasCredentials: data.credentials ? "yes" : "no",
    })

    // Jika ID disediakan, ambil integrasi dari database
    if (data.id) {
      console.log(`Looking for integration with ID: ${data.id}`)
      const integration = await prisma.integration.findUnique({
        where: { id: data.id },
      })

      if (!integration) {
        console.log(`Integration with ID ${data.id} not found`)
        return NextResponse.json({ error: "Integration not found" }, { status: 404 })
      }

      console.log("Found integration:", {
        id: integration.id,
        name: integration.name,
        source: integration.source,
        hasCredentials: integration.credentials ? "yes" : "no",
      })

      // Uji koneksi berdasarkan jenis integrasi
      if (integration.source === "stellar-cyber") {
        // Ekstrak kredensial dari database
        let credentials: Record<string, any> = {}

        // Cek apakah kredensial adalah array atau objek
        if (Array.isArray(integration.credentials)) {
          console.log("Credentials are in array format, converting to object format...")
          const credentialsArray = integration.credentials as any[]
          credentialsArray.forEach((cred) => {
            if (cred && typeof cred === "object" && "key" in cred && "value" in cred) {
              credentials[cred.key] = cred.value
            }
          })
        } else {
          credentials = integration.credentials as Record<string, any>
        }

        console.log("Credentials keys:", Object.keys(credentials))

        // Pastikan format kredensial sesuai dengan yang diharapkan oleh fungsi testStellarCyberConnection
        const formattedCredentials = {
          host: credentials.host || credentials.STELLAR_CYBER_HOST || "",
          user_id: credentials.user_id || credentials.STELLAR_CYBER_USER_ID || "",
          refresh_token: credentials.refresh_token || credentials.STELLAR_CYBER_REFRESH_TOKEN || "",
          tenant_id: credentials.tenant_id || credentials.STELLAR_CYBER_TENANT_ID || "",
        }

        console.log("Testing Stellar Cyber connection with credentials:", {
          host: formattedCredentials.host ? "provided" : "missing",
          user_id: formattedCredentials.user_id ? "provided" : "missing",
          refresh_token: formattedCredentials.refresh_token ? "provided" : "missing",
          tenant_id: formattedCredentials.tenant_id ? "provided" : "missing",
        })

        const result = await testStellarCyberConnection(formattedCredentials)
        console.log("Test result:", result)

        // Update status integrasi
        await prisma.integration.update({
          where: { id: integration.id },
          data: {
            status: result.success ? "connected" : "error",
            lastSync: result.success ? new Date() : undefined,
          },
        })

        return NextResponse.json(result)
      }

      // Tambahkan logika untuk jenis integrasi lainnya di sini
      if (integration.source === "qradar") {
        console.log("Testing QRadar connection for integration id:", integration.id)

        // Normalize credentials from array or object
        let credentials: Record<string, any> = {}
        if (Array.isArray(integration.credentials)) {
          const credentialsArray = integration.credentials as any[]
          credentialsArray.forEach((cred) => {
            if (cred && typeof cred === "object" && "key" in cred && "value" in cred) {
              credentials[cred.key] = cred.value
            }
          })
        } else {
          credentials = integration.credentials as Record<string, any>
        }

        const host = (credentials.host || credentials.HOST || credentials.host_url || "").toString()
        const normalizedHost = host.replace(/^https?:\/\//i, "").replace(/\/$/, "")
        const apiKey = credentials.api_key || credentials.apiKey || credentials.token || credentials.SEC || ""

        if (!host || !apiKey) {
          return NextResponse.json({ error: "Missing QRadar host or api_key" }, { status: 400 })
        }

        // Allow self-signed for on-prem QRadar (same behavior as QRadarClient)
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

        const httpsAgent = new https.Agent({ rejectUnauthorized: false })

        try {
          const url = `https://${normalizedHost}/api/siem/offenses?Range=items=0-0`
          console.log("QRadar test URL:", url)

          const res = await fetch(url, {
            method: "GET",
            headers: {
              SEC: apiKey,
              Accept: "application/json",
            },
          })

          if (res.ok) {
            await prisma.integration.update({ where: { id: integration.id }, data: { status: "connected", lastSync: new Date() } })
            return NextResponse.json({ success: true })
          }

          const text = await res.text().catch(() => "")
          console.log("QRadar test returned non-ok:", res.status, res.statusText, text)
          return NextResponse.json({ error: `QRadar returned ${res.status} ${res.statusText}` }, { status: 400 })
        } catch (err) {
          console.error("QRadar test error:", err)
          return NextResponse.json({ error: "Failed to reach QRadar" }, { status: 500 })
        } finally {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
        }
      }

      // Test Wazuh integration
      if (integration.source === "wazuh") {
        console.log("Testing Wazuh connection for integration id:", integration.id)

        let credentials: Record<string, any> = {}
        if (Array.isArray(integration.credentials)) {
          const credentialsArray = integration.credentials as any[]
          credentialsArray.forEach((cred) => {
            if (cred && typeof cred === "object" && "key" in cred && "value" in cred) {
              credentials[cred.key] = cred.value
            }
          })
        } else {
          credentials = integration.credentials as Record<string, any>
        }

        const elasticsearch_url = credentials.elasticsearch_url || ""
        const elasticsearch_username = credentials.elasticsearch_username || ""
        const elasticsearch_password = credentials.elasticsearch_password || ""

        if (!elasticsearch_url || !elasticsearch_username || !elasticsearch_password) {
          return NextResponse.json(
            { error: "Missing Wazuh Elasticsearch credentials" },
            { status: 400 }
          )
        }

        try {
          const auth = Buffer.from(`${elasticsearch_username}:${elasticsearch_password}`).toString("base64")
          const res = await fetch(`${elasticsearch_url}/_cluster/health`, {
            headers: { Authorization: `Basic ${auth}` },
          } as any)

          if (res.ok) {
            await prisma.integration.update({
              where: { id: integration.id },
              data: { status: "connected", lastSync: new Date() },
            })
            return NextResponse.json({ success: true, message: "Wazuh connection successful" })
          }

          return NextResponse.json(
            { error: `Elasticsearch error: ${res.status}` },
            { status: 400 }
          )
        } catch (err) {
          console.error("Wazuh test error:", err)
          return NextResponse.json({ error: "Failed to connect to Wazuh" }, { status: 500 })
        }
      }

      return NextResponse.json({ error: "Unsupported integration type" }, { status: 400 })
    }

    // Jika tidak ada ID, uji koneksi dengan kredensial yang diberikan
    if (data.source === "stellar-cyber" && data.credentials) {
      console.log("Testing Stellar Cyber connection with provided credentials")

      // Pastikan format kredensial sesuai dengan yang diharapkan oleh fungsi testStellarCyberConnection
      const formattedCredentials = {
        host: data.credentials.host || data.credentials.STELLAR_CYBER_HOST || "",
        user_id: data.credentials.user_id || data.credentials.STELLAR_CYBER_USER_ID || "",
        refresh_token: data.credentials.refresh_token || data.credentials.STELLAR_CYBER_REFRESH_TOKEN || "",
        tenant_id: data.credentials.tenant_id || data.credentials.STELLAR_CYBER_TENANT_ID || "",
      }

      console.log("Formatted credentials:", {
        host: formattedCredentials.host ? "provided" : "missing",
        user_id: formattedCredentials.user_id ? "provided" : "missing",
        refresh_token: formattedCredentials.refresh_token ? "provided" : "missing",
        tenant_id: formattedCredentials.tenant_id ? "provided" : "missing",
      })

      const result = await testStellarCyberConnection(formattedCredentials)
      console.log("Test result:", result)
      return NextResponse.json(result)
    }

    // Test QRadar using provided credentials
    if (data.source === "qradar" && data.credentials) {
      console.log("Testing QRadar with provided credentials")
      const credentials = data.credentials
      const host = (credentials.host || credentials.HOST || credentials.host_url || "").toString()
      const normalizedHost = host.replace(/^https?:\/\//i, "").replace(/\/$/, "")
      const apiKey = credentials.api_key || credentials.apiKey || credentials.token || credentials.SEC || ""

      if (!host || !apiKey) {
        return NextResponse.json({ error: "Missing QRadar host or api_key" }, { status: 400 })
      }

      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
      const httpsAgent = new https.Agent({ rejectUnauthorized: false })

      try {
        const url = `https://${normalizedHost}/api/siem/offenses?Range=items=0-0`
        const res = await fetch(url, {
          method: "GET",
          headers: {
            SEC: apiKey,
            Accept: "application/json",
          },
        })

        if (res.ok) {
          return NextResponse.json({ success: true })
        }

        const text = await res.text().catch(() => "")
        console.log("QRadar test returned non-ok:", res.status, res.statusText, text)
        return NextResponse.json({ error: `QRadar returned ${res.status} ${res.statusText}` }, { status: 400 })
      } catch (err) {
        console.error("QRadar test error:", err)
        return NextResponse.json({ error: "Failed to reach QRadar" }, { status: 500 })
      } finally {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
      }
    }

    // Test Wazuh with provided credentials
    if (data.source === "wazuh" && data.credentials) {
      const creds = data.credentials
      const es_url = creds.elasticsearch_url || ""
      const es_user = creds.elasticsearch_username || ""
      const es_pass = creds.elasticsearch_password || ""

      if (!es_url || !es_user || !es_pass) {
        return NextResponse.json({ error: "Missing Wazuh credentials" }, { status: 400 })
      }

      try {
        const auth = Buffer.from(`${es_user}:${es_pass}`).toString("base64")
        const res = await fetch(`${es_url}/_cluster/health`, {
          headers: { Authorization: `Basic ${auth}` },
        } as any)

        if (res.ok) {
          return NextResponse.json({ success: true })
        }
        return NextResponse.json({ error: `Elasticsearch error: ${res.status}` }, { status: 400 })
      } catch (err) {
        console.error("Wazuh test error:", err)
        return NextResponse.json({ error: "Wazuh connection failed" }, { status: 500 })
      }
    }

    console.log("Missing required parameters for testing integration")
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
  } catch (error) {
    console.error("Error testing integration:", error)
    return NextResponse.json({ error: "Failed to test integration" }, { status: 500 })
  }
}
