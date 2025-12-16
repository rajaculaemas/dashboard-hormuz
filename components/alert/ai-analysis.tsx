"use client"
import React, { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Sparkles, Loader2, Bot } from "lucide-react"

interface AiAnalysisProps {
  getPayload: () => { query_text: string; source_type: string; system_prompt?: string }
  buttonLabel?: string
}

export function AiAnalysis({ getPayload, buttonLabel = "AI Analysis" }: AiAnalysisProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [chars, setChars] = useState(0)
  const [tokens, setTokens] = useState(0)
  const [controller, setController] = useState<AbortController | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const manualAbortRef = useRef<boolean>(false)

  const renderAiResult = (res: any) => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-8 gap-4">
          <div className="relative">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <Bot className="w-8 h-8 text-primary z-10" />
              <Loader2 className="absolute w-16 h-16 animate-spin text-primary/30" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">Analyzing your alert</p>
            <div className="flex items-center justify-center gap-1 mt-2">
              <span className="text-xs text-muted-foreground">Processing</span>
              <div className="flex gap-1">
                <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{animationDelay: '0ms'}}></span>
                <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{animationDelay: '150ms'}}></span>
                <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{animationDelay: '300ms'}}></span>
              </div>
            </div>
          </div>
        </div>
      )
    }
    if (!res) return <p className="text-muted-foreground">No result</p>

    let parsed: any = res
    if (typeof res === "string") {
      try {
        parsed = JSON.parse(res)
      } catch {
        parsed = res
      }
    }

    if (typeof parsed === "string") {
      return <pre className="whitespace-pre-wrap text-sm">{parsed}</pre>
    }

    const answer = parsed.answer || parsed.answer_text || parsed.summary || (parsed.data && (parsed.data.answer || parsed.data.text))

    return (
      <div>
        {parsed.mock && parsed.message && (
          <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 text-sm rounded">{parsed.message}</div>
        )}
        <div className="mb-2 text-xs text-muted-foreground space-y-1">
          {Object.entries(parsed)
            .filter(([k]) => !["answer", "answer_text", "summary", "data"].includes(k))
            .map(([k, v]) => (
              <div key={k}>
                <strong className="mr-1">{k}:</strong>
                <span>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
              </div>
            ))}
        </div>
        {answer ? (
          <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-2 rounded">{answer}</pre>
        ) : (
          <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(parsed, null, 2)}</pre>
        )}
      </div>
    )
  }

  const handleStart = async () => {
    const payload = getPayload()
    setLoading(true)
    setResult(null)
    setOpen(true)
    try {
      manualAbortRef.current = false
      const c = new AbortController()
      setController(c)
      timeoutRef.current = window.setTimeout(() => c.abort(), 180000)

      const res = await fetch("/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: c.signal,
      })

      const contentType = res.headers.get("content-type") || ""
      if (contentType.includes("application/json")) {
        const data = await res.json()
        if (data && data.success) setResult(data.data)
        else setResult({ error: data?.error || "LLM returned error" })
      } else if (res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let done = false
        let acc = ""
        while (!done) {
          const { value, done: d } = await reader.read()
          if (value) {
            acc += decoder.decode(value, { stream: true })
            setResult(acc)
            setChars(acc.length)
            setTokens(Math.ceil(acc.length / 4))
          }
          done = !!d
        }
        try { setResult(JSON.parse(acc)) } catch {}
      } else {
        const text = await res.text()
        try { setResult(JSON.parse(text)) } catch { setResult(text) }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") {
        if (manualAbortRef.current) {
          setResult({ error: "Cancelled by user" })
          setOpen(false)
        } else {
          setResult({ error: "Timed out after 180s — the LLM may still be processing. You can Retry or Close." })
        }
      } else {
        setResult({ error: String(e) })
      }
    } finally {
      setLoading(false)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      setController(null)
      manualAbortRef.current = false
    }
  }

  const handleCancel = () => {
    manualAbortRef.current = true
    if (controller) controller.abort()
    setLoading(false)
    setController(null)
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    setOpen(false)
  }

  const handleRetry = () => {
    setResult(null)
    handleStart()
  }

  return (
    <>
      <Button size="sm" variant="default" onClick={handleStart} disabled={loading} className="gap-2">
        <Sparkles className="h-4 w-4" />
        {buttonLabel}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="bg-white p-4 rounded shadow-lg max-w-3xl w-full max-h-[70vh] overflow-auto">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium">AI Analysis Result</h3>
              <div className="text-xs text-muted-foreground ml-4">
                {chars > 0 && (
                  <div>{chars} chars (~{tokens} tokens)</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {loading && <Button size="sm" variant="ghost" onClick={handleCancel}>Cancel</Button>}
                {!loading && result?.error && <Button size="sm" variant="ghost" onClick={handleRetry}>Retry</Button>}
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
              </div>
            </div>
            <div className="text-sm">{renderAiResult(result)}</div>
          </div>
        </div>
      )}
    </>
  )
}
