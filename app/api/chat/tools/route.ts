import { NextResponse } from "next/server"
import { executeTool } from "@/lib/chat/tools"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { tool, parameters } = body
    const result = await executeTool(tool, parameters)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error in chat tools:", error)
    if (error.message?.startsWith("Unknown tool:")) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
