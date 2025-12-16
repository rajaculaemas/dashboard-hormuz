// app/api/chat/route.ts
import { NextResponse } from "next/server"

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
]

export async function POST(req: Request) {
  try {
    const body = await req.json()

    // Validasi messages
    const messages = Array.isArray(body.messages) ? body.messages : []

    // Add system message for alert context
    const systemMessage = {
      role: "system",
      content: `You are a cybersecurity analyst assistant with access to a security alert database. You can help users analyze security alerts, get statistics, and search for specific incidents.

Available functions:
- get_alerts: Retrieve recent security alerts with filters
- get_alert_stats: Get alert statistics and counts
- search_alerts: Search alerts by keywords

When users ask about alerts, always use the appropriate function to get real-time data from the database. Provide clear, actionable insights about security incidents.

Current time: ${new Date().toISOString()}`,
    }

    const messagesWithSystem = [systemMessage, ...messages]

    // Konfigurasi dengan tools
    const payload = {
      model: process.env.OPENROUTER_MODEL,
      messages: messagesWithSystem,
      temperature: 0.7,
      max_tokens: 2000,
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

    // Handle tool calls
    if (result.choices?.[0]?.message?.tool_calls) {
      const toolCalls = result.choices[0].message.tool_calls
      const toolResults = []

      for (const toolCall of toolCalls) {
        const { name, arguments: args } = toolCall.function

        try {
          const parsedArgs = JSON.parse(args)

          // Call our internal tool API
          const toolResponse = await fetch(`${req.url.replace("/chat", "/chat/tools")}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              tool: name,
              parameters: parsedArgs,
            }),
          })

          const toolResult = await toolResponse.json()

          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: name,
            content: JSON.stringify(toolResult),
          })
        } catch (error) {
          console.error(`Error calling tool ${name}:`, error)
          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: name,
            content: JSON.stringify({ error: "Tool execution failed" }),
          })
        }
      }

      // Send tool results back to get final response
      const finalPayload = {
        model: process.env.OPENROUTER_MODEL,
        messages: [...messagesWithSystem, result.choices[0].message, ...toolResults],
        temperature: 0.7,
        max_tokens: 2000,
      }

      const finalResponse = await fetch(`${process.env.OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify(finalPayload),
      })

      return NextResponse.json(await finalResponse.json())
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Server error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
