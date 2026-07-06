// app/api/chat/route.ts
import { NextResponse } from "next/server"
import { executeTool } from "@/lib/chat/tools"

const AVAILABLE_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_alerts",
      description: "Get security alerts from the database with optional filters",
      parameters: {
        type: "object",
        properties: {
          timeRange: {
            type: "string",
            enum: [
              "15m", "30m",
              "1h", "2h", "3h", "6h", "12h",
              "24h",
              "2d", "3d", "7d", "14d",
              "30d"
              ],
              
            description: "Time range for alerts (e.g. 15m, 30m, 1h, ..., 30d)",
          },
          status: {
            type: "string",
            enum: ["New", "In Progress", "Ignored", "Closed"],
            description: "Filter by alert status",
          },
          minSeverity: {
            type: "number",
            description: "Minimum severity",
          },
          
            maxSeverity: {
            type: "number",
            description: "Maximum severity",
          },
          limit: {
            type: "number",
            description: "Maximum number of alerts to return (default: 100)",
          },
          integrationId: {
            type: "string",
            description: "Filter alerts from a specific integration by its ID. Get the ID first using get_integrations.",
          },
          integrationName: {
            type: "string",
            description: "Filter alerts by integration name (partial match, case-insensitive). Alternative to integrationId if you know the name.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_alert_stats",
      description: "Get statistics about alerts including counts by status and severity",
      parameters: {
        type: "object",
        properties: {
          timeRange: {
            type: "string",
            enum: [
              "15m", "30m",
              "1h", "2h", "3h", "6h", "12h",
              "24h",
              "2d", "3d", "7d", "14d",
              "30d"
              ],
            description: "Time range for statistics (default: 24h)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_alerts",
      description: "Search alerts by keywords in title, description, or source",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          timeRange: {
            type: "string",
            enum: [
              "15m", "30m",
              "1h", "2h", "3h", "6h", "12h",
              "24h",
              "2d", "3d", "7d", "14d",
              "30d"
              ],
            description: "Time range for search (default: 24h)",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 20)",
          },
        },
      },
    },
  },
  
  {
    type: "function",
    function: {
      name: "check_ip_threat",
      description: "Check if an IP address is known to be malicious using threat intelligence sources like VirusTotal",
      parameters: {
        type: "object",
        properties: {
          ip: {
            type: "string",
            description: "The IP address to check",
          },
        },
        required: ["ip"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_integrations",
      description: "List all active SIEM integrations (QRadar, Wazuh, Stellar Cyber, etc.) with their IDs and sources. Call this first when user asks to query a specific SIEM or when you need an integrationId.",
      parameters: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "Filter by source type: 'qradar', 'wazuh', 'stellar-cyber', or omit for all",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_alert_detail",
      description: "Get full detail of a single alert including metadata, timeline, and related cases. Use when user asks for details about a specific alert.",
      parameters: {
        type: "object",
        properties: {
          alertId: {
            type: "string",
            description: "Internal alert ID (cuid)",
          },
          externalId: {
            type: "string",
            description: "External alert ID from the SIEM source",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cases",
      description: "Get security cases/incidents from the database. Cases are higher-level groupings of related alerts.",
      parameters: {
        type: "object",
        properties: {
          timeRange: {
            type: "string",
            enum: ["1h", "6h", "12h", "24h", "7d", "30d"],
            description: "Time range to look back (default: 24h)",
          },
          status: {
            type: "string",
            description: "Filter by case status",
          },
          limit: {
            type: "number",
            description: "Maximum number of cases to return (default: 20)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_qradar_events",
      description: "Query raw events from QRadar SIEM for a specific offense/alert. Use this when user asks to investigate events related to a QRadar offense or wants to see raw logs. Requires integrationId — call get_integrations first if unknown.",
      parameters: {
        type: "object",
        properties: {
          offenseId: {
            type: "number",
            description: "The QRadar offense ID to fetch events for",
          },
          integrationId: {
            type: "string",
            description: "The integration ID of the QRadar connection",
          },
        },
        required: ["offenseId", "integrationId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_wazuh_events",
      description: "Search raw logs/events from Wazuh Elasticsearch (no syslog_level filter — returns all event types). Use when user asks for Wazuh/Fortinet/Palo Alto logs, wants to investigate an IP, agent, or rule. Requires integrationId — call get_integrations first if unknown.",
      parameters: {
        type: "object",
        properties: {
          integrationId: {
            type: "string",
            description: "The integration ID of the Wazuh connection",
          },
          query: {
            type: "string",
            description: "Free-text search query (query_string syntax). Examples: 'DNS Command-and-Control', 'rule_description:brute', 'srcip:10.0.0.1'. Searched across rule_description, message, logdesc, agent_name, src_ip, dst_ip.",
          },
          srcIp: {
            type: "string",
            description: "Filter by source IP address",
          },
          dstIp: {
            type: "string",
            description: "Filter by destination IP address",
          },
          agentName: {
            type: "string",
            description: "Filter by agent/host name (partial match)",
          },
          ruleId: {
            type: "string",
            description: "Filter by specific rule ID",
          },
          indexPattern: {
            type: "string",
            description: "Comma-separated index patterns to search. Available: 'wazuh-posindonesia*' (Wazuh/HIDS events), 'fortinet-posindonesia*' (Fortinet VPN/firewall), 'palo_alto-fw-posindonesia*' (Palo Alto firewall). Default: all three. Example: 'wazuh-posindonesia*,fortinet-posindonesia*'",
          },
          timeRange: {
            type: "string",
            enum: ["1h", "2h", "3h", "6h", "12h", "24h", "7d"],
            description: "Time range to search (default: 24h)",
          },
          limit: {
            type: "number",
            description: "Maximum number of events to return (default: 20)",
          },
        },
        required: ["integrationId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_stellar_events",
      description: "Search raw events from Stellar Cyber Elasticsearch. Use when user asks for related events, raw logs, or IP investigation in Stellar Cyber. IMPORTANT: Do NOT use aella-* (causes timeout). Default index is aella-ser-* (alerts). For network/flow events (firewall, VPN, syslog) use aella-syslog-*, for Windows events use aella-wineventlog-*, for signals use aella-signals-*. Requires integrationId — call get_integrations first if unknown. For Cisco Meraki VPN/AnyConnect: use indexPattern=aella-syslog-* and query with cisco_meraki.user and cisco_meraki.event_type fields.",
      parameters: {
        type: "object",
        properties: {
          integrationId: {
            type: "string",
            description: "The integration ID of the Stellar Cyber connection",
          },
          indexPattern: {
            type: "string",
            description: "Elasticsearch index pattern. Use: 'aella-ser-*' (default, alerts), 'aella-syslog-*' (network/firewall/flow events), 'aella-wineventlog-*' (Windows events), 'aella-signals-*' (signals), 'aella-maltrace-*' (malware). NEVER use 'aella-*' (too broad, will timeout).",
          },
          query: {
            type: "string",
            description: "Lucene query string. Examples: 'srcip:192.168.1.1', 'event_name:login'. For Cisco Meraki VPN by username: 'cisco_meraki.user:\"defiagni.saputri\" AND cisco_meraki.event_type:*anyconnect*'. For Cisco Meraki by event type: 'cisco_meraki.event_type:anyconnect_vpn_connect'. Nested fields use dot notation: cisco_meraki.user, cisco_meraki.event_type, cisco_meraki.peer_ip.",
          },
          srcIp: {
            type: "string",
            description: "Filter by source IP address",
          },
          dstIp: {
            type: "string",
            description: "Filter by destination IP address",
          },
          timeRange: {
            type: "string",
            enum: ["1h", "2h", "3h", "6h", "12h", "24h", "7d"],
            description: "Time range to search (default: 24h)",
          },
          limit: {
            type: "number",
            description: "Maximum number of events to return (default: 20)",
          },
        },
        required: ["integrationId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_qradar_aql",
      description: "Execute a custom AQL (Ariel Query Language) query on QRadar. Use for advanced event hunting, log source filtering, or when you have a specific AQL query to run. Also auto-fetches offense details (log sources, source IPs) to help build targeted queries. Requires integrationId — call get_integrations first if unknown.",
      parameters: {
        type: "object",
        properties: {
          integrationId: {
            type: "string",
            description: "The integration ID of the QRadar connection",
          },
          aql: {
            type: "string",
            description: "Custom AQL query to execute. Example: \"SELECT sourceip, destinationip, eventcount, QIDNAME(qid) as event_name FROM events WHERE logsourceid IN (123,456) LAST 24 HOURS\"",
          },
          offenseId: {
            type: "number",
            description: "Optional: QRadar offense ID. If provided, fetches offense details (log sources, IPs) and includes them as context. Can auto-generate an AQL from offense details if no custom AQL provided.",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 30)",
          },
        },
        required: ["integrationId"],
      },
    },
  },
]

export async function POST(req: Request) {
  try {
    const body = await req.json()

    // Validasi messages
    const messages = Array.isArray(body.messages) ? body.messages : []

    // Add system message for alert context
    const systemMessage = {
      role: "system",
      content: `You are a SOC (Security Operations Center) analyst assistant. You have direct access to the security alert database and SIEM integrations via tools.

TOOLS AVAILABLE:
- get_integrations: List all connected integrations with their IDs. ALWAYS call this first when user mentions a SIEM by name (Stellar Cyber, QRadar, Wazuh) and you don't have the integrationId yet.
- get_alerts: Get alerts from local DB. Supports integrationId filter — use this IMMEDIATELY after get_integrations to fetch alerts for that integration.
- get_alert_stats: Alert statistics by severity/status.
- search_alerts: Full-text search across alert titles and descriptions.
- get_alert_detail: Full detail of one specific alert.
- get_cases: Get security cases/incidents.
- query_stellar_events: Raw events from Stellar Cyber Elasticsearch. NEVER use indexPattern "aella-*" (timeout). For IP search: try "aella-syslog-*" (network flows) and "aella-ser-*" (alerts) separately. For Windows events: "aella-wineventlog-*".

STELLAR CYBER FIELD STRUCTURE (use exact nested paths in query parameter):
- Cisco Meraki events (VPN/AnyConnect): index="aella-syslog-*", device field: dev_type="cisco_meraki"
  - Username: cisco_meraki.user (e.g. cisco_meraki.user:"defiagni.saputri")
  - VPN event type: cisco_meraki.event_type (e.g. anyconnect_vpn_connect, anyconnect_vpn_session_manager)
  - Peer IP (external/public IP of VPN client): cisco_meraki.peer_ip
  - Assigned IP (internal VPN tunnel IP assigned to the user, e.g. 10.200.x.x): cisco_meraki.allocated_assigned_ip
  - CRITICAL IP ROUTING RULE for Cisco Meraki:
    * If user asks "user dengan IP 10.x.x.x" or private RFC1918 IP → MUST use query="cisco_meraki.allocated_assigned_ip:\"IP\"" — this is the VPN-assigned tunnel IP
    * If user asks "user dengan IP public / external IP" → use query="cisco_meraki.peer_ip:\"IP\""
    * NEVER use srcIp/dstIp parameter for Cisco Meraki VPN IP lookups — those fields are empty for VPN session events
    * ALWAYS use query parameter with nested field path syntax for Cisco Meraki
  - To find user by assigned VPN IP: query="cisco_meraki.allocated_assigned_ip:\"10.200.201.141\"" indexPattern="aella-syslog-*"
  - To find VPN activity for a user: query="cisco_meraki.user:\"USERNAME\" AND cisco_meraki.event_type:*anyconnect*" indexPattern="aella-syslog-*"
  - To find all VPN sessions: query="cisco_meraki.event_type:anyconnect_vpn_session_manager" indexPattern="aella-syslog-*"
- Palo Alto firewall events: index="aella-syslog-*", dev_type="palo_alto"
  - Username: srcuser (top-level)
- Office 365 / Azure AD events: index="aella-wineventlog-*" (NOT aella-syslog-*)
  - msg_class: office365_audit_azureactivedirectory (Azure AD), office365_audit_exchange, office365_audit_sharepoint
  - msg_origin.source: "office365"
  - Operation: the action performed (e.g. "Delete user.", "Add user.", "Update user.", "UserLoggedIn")
  - ObjectId: email/UPN of the TARGET user (e.g. "Ferdinand.Tampubolon@msiglife.co.id") — THIS IS THE DELETED USER
  - UserId: who performed the action (e.g. "ServicePrincipal_465fb6a8-..." or "admin@tenant.com")
  - ResultStatus: "Success" or "Failure"
  - Workload: "AzureActiveDirectory", "Exchange", "SharePoint"
  - Target[].ID: array of target identifiers, Type=5 contains email UPN
  - ModifiedProperties[].Name/OldValue/NewValue: what properties changed
  - To find all users deleted: query="Operation:\"Delete user.\"" indexPattern="aella-wineventlog-*"
  - To find who was deleted (ObjectId contains email): query="Operation:\"Delete user.\" AND ObjectId:*@msiglife.co.id" indexPattern="aella-wineventlog-*"
  - To find deletions by a specific actor: query="UserId:\"ACTORID\" AND Operation:\"Delete user.\"" indexPattern="aella-wineventlog-*"
  - IMPORTANT: When asked "siapa yang dihapus" for Office 365 → search aella-wineventlog-* with Operation:"Delete user." → return ObjectId field as the deleted user
- Generic top-level fields: srcip, dstip, srcport, dstport, proto_name, msg_class, dev_type, tenant_name
- query_qradar_events: Raw events from QRadar for a specific offense.
- execute_qradar_aql: Execute custom AQL on QRadar.
- query_wazuh_events: Search raw logs from Wazuh/Fortinet/Palo Alto Elasticsearch — no mandatory filters. Index patterns: wazuh-posindonesia* (Wazuh/HIDS), fortinet-posindonesia* (Fortinet VPN/firewall), palo_alto-fw-posindonesia* (Palo Alto). Supports: query (query_string), srcIp, dstIp, agentName, ruleId. Searches all indices by default.
- check_ip_threat: VirusTotal IP reputation check.

CRITICAL RULES — follow exactly:
1. NEVER ask the user to wait, then stop. Always chain tool calls in the same response until you have the data.
2. When user asks for alerts from "Stellar Cyber MSIG": call get_integrations → immediately call get_alerts with the returned integrationId → present results. Do NOT stop after get_integrations.
3. When you have an integrationId from get_integrations, call the next tool immediately without explaining what you're about to do.
4. Never say "saya akan ambil data sekarang" and then stop — actually call the tool.
5. Only respond in Bahasa Indonesia. Keep technical field names and values as-is.
6. When user asks to search events for an IP in Stellar Cyber: use srcIp OR dstIp parameter (not query string). Try "aella-syslog-*" first for network flows, then "aella-ser-*" for alerts. Call both in the same turn if needed.
7. HISTORICAL ALERT CHECK — MANDATORY on every analysis request: When user asks to analyze an alert, ALWAYS call search_alerts with the alert title as query and timeRange="30d" BEFORE or IN PARALLEL with other lookups. Use the results (analysisNotes, severityBasedOnAnalysis, timeline, status) to inform your recommendation. State explicitly: "Berdasarkan X alert serupa di histori: biasanya ditangani sebagai [status/action], dengan catatan: [analysisNotes]."

WINDOWS LOGON FAILURE CODES — always explain these when they appear in alerts:
- 0xC000006D (STATUS_LOGON_FAILURE): Generic auth failure — username or password is wrong
- 0xC0000064 (STATUS_NO_SUCH_USER): Username does not exist in the domain — account tidak ada / typo nama akun
- 0xC000006A (STATUS_WRONG_PASSWORD): Username valid tapi password salah
- 0xC0000234 (STATUS_ACCOUNT_LOCKED_OUT): Akun terkunci karena terlalu banyak percobaan gagal
- 0xC0000072 (STATUS_ACCOUNT_DISABLED): Akun dinonaktifkan
- 0xC000015B (STATUS_LOGON_TYPE_NOT_GRANTED): Jenis logon tidak diizinkan untuk akun ini
- 0xC0000193 (STATUS_ACCOUNT_EXPIRED): Akun sudah expired
- 0xC0000071 (STATUS_PASSWORD_EXPIRED): Password sudah expired
- 0xC000006F (STATUS_INVALID_LOGON_HOURS): Login di luar jam yang diizinkan
- 0xC0000070 (STATUS_INVALID_WORKSTATION): Login dari workstation yang tidak diizinkan
Kombinasi umum: SubStatus 0xC0000064 = user tidak ada (bukan password salah); SubStatus 0xC000006A = user ada tapi password salah. Selalu sebut implikasinya dalam analisis.

QUERY SYNTAX RULES for query_wazuh_events:
- "mengandung X" / "yang ada X" / "contains X" → use wildcard: query="*X*" OR query="field:*X*"
- "field X mengandung Y" (e.g. "syslog_description mengandung DNS Command") → query="syslog_description:*DNS Command*"
- "dari Palo Alto" → indexPattern="palo_alto-fw-posindonesia*"
- "dari Fortinet" → indexPattern="fortinet-posindonesia*"  
- "dari Wazuh" → indexPattern="wazuh-posindonesia*"
- "dari semua index" → omit indexPattern (searches all 3)
- Wildcard in query_string: use * for partial match. Example: "DNS*" matches "DNS Command-and-Control activity detected"
- NEVER use exact phrase (without wildcard) for "mengandung" queries — always add * around terms

INDEX & FIELD MAPPING — CRITICAL:
All 3 index patterns share the SAME Wazuh/Elasticsearch connection. "Integrasi Wazuh" means the Elasticsearch credentials, NOT just wazuh-posindonesia*.
When user says "integrasi wazuh" WITHOUT specifying a particular index, ALWAYS search all 3 patterns (omit indexPattern).

Field name → which index it lives in:
- syslog_description, logdesc, log_id, serial_no, srcintf, dstintf, service, action, devname → PALO ALTO or FORTINET → use palo_alto-fw-posindonesia* or fortinet-posindonesia*
- rule_description, rule_id, agent_name, agent.name, rule.mitre.tactic → WAZUH → use wazuh-posindonesia*
- src_ip, dst_ip, message, timestamp → present in ALL indexes

PALO ALTO THREAT EVENT FIELDS (index: palo_alto-fw-posindonesia*):
- alert_indicator: the domain/IP/URL that triggered the alert (e.g. "qrbzo.m.xpmrlba.com") — USE THIS for indicator correlation
- alert_signature: signature description (e.g. "Tunneling:xpmrlba.com(109001001)")
- alert_category: array of categories (e.g. ["dns-c2", "any"])
- vendor_event_action: what Palo Alto did with the traffic — values: "alert" (just alerted), "sinkhole" (redirected), "drop" (dropped silently), "dropped", "block-ip", "reset-client", "reset-server", "reset-both"
- vendor_alert_severity: the PA-assigned severity (high, medium, low, critical, informational)
- pan_log_subtype: threat subtype (spyware, vulnerability, wildfire, url, data)
- application_name: application detected (e.g. "dns-base")
- syslog_description: human-readable description (e.g. "DNS Command-and-Control activity detected")

PALO ALTO THREAT CORRELATION RULES:
1. When user asks "cari action lain untuk indikator yang sama" or "korelasi event" → query="alert_indicator:\"DOMAIN_OR_IP\"" indexPattern="palo_alto-fw-posindonesia*"
2. For domain searches ALWAYS use field syntax with quotes: alert_indicator:"xpmrlba.com" NOT plain text (dots in domains cause parsing issues)
3. To find ALL actions for an indicator: query="alert_indicator:*xpmrlba*" → returns events with vendor_event_action = alert, sinkhole, drop, etc.
4. To find sinkhole/dropped events: query="alert_indicator:*xpmrlba* AND vendor_event_action:sinkhole" OR query="vendor_event_action:drop"
5. When user says "action berbeda" or "action selain alert" → add AND NOT vendor_event_action:alert OR search without action filter and show all vendor_event_action values in results

When user says "field syslog_description mengandung X" → ALWAYS use indexPattern="palo_alto-fw-posindonesia*" regardless of which integration they mention.
When user says "field logdesc mengandung X" → ALWAYS use indexPattern="fortinet-posindonesia*".
When user says "field rule_description mengandung X" → ALWAYS use indexPattern="wazuh-posindonesia*".

Current time: ${new Date().toISOString()}`,
    }

    const messagesWithSystem = [systemMessage, ...messages]

    // Konfigurasi dengan tools
    const payload = {
      model: process.env.OPENROUTER_MODEL,
      messages: messagesWithSystem,
      temperature: 0.7,
      max_completion_tokens: 2000,
      top_p: 0.9,
      frequency_penalty: 0,
      presence_penalty: 0,
      tools: AVAILABLE_TOOLS,
      tool_choice: "auto",
    }

    const response = await fetch(`${process.env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error("OpenRouter error:", error)
      return NextResponse.json({ error: "AI service error" }, { status: 500 })
    }

    const result = await response.json()

    // Multi-round tool calling loop (up to 5 rounds to allow chaining)
    let currentResult = result
    let currentMessages = [...messagesWithSystem]
    const MAX_ROUNDS = 5
    let round = 0

    while (currentResult.choices?.[0]?.message?.tool_calls && round < MAX_ROUNDS) {
      round++
      const toolCalls = currentResult.choices[0].message.tool_calls
      const toolResults = []

      for (const toolCall of toolCalls) {
        const { name, arguments: args } = toolCall.function

        try {
          const parsedArgs = JSON.parse(args)
          console.log(`[chat] Tool call round ${round}: ${name}`, parsedArgs)

          // Call tool directly (no HTTP — avoids auth middleware)
          const toolResult = await executeTool(name, parsedArgs)

          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name,
            content: JSON.stringify(toolResult),
          })
        } catch (error) {
          console.error(`Error calling tool ${name}:`, error)
          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name,
            content: JSON.stringify({ error: "Tool execution failed" }),
          })
        }
      }

      // Append assistant message + tool results, then call LLM again
      currentMessages = [...currentMessages, currentResult.choices[0].message, ...toolResults]

      const nextPayload = {
        model: process.env.OPENROUTER_MODEL,
        messages: currentMessages,
        temperature: 0.7,
        max_completion_tokens: 2000,
        tools: AVAILABLE_TOOLS,
        tool_choice: "auto",
      }

      const nextResponse = await fetch(`${process.env.OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify(nextPayload),
      })

      if (!nextResponse.ok) {
        const error = await nextResponse.json()
        console.error("OpenRouter error (round " + round + "):", error)
        return NextResponse.json({ error: "AI service error" }, { status: 500 })
      }

      currentResult = await nextResponse.json()
    }

    return NextResponse.json(currentResult)
  } catch (error) {
    console.error("Server error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
