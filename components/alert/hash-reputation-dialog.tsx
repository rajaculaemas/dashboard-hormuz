"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, ShieldAlert, ShieldCheck, ShieldQuestion, AlertTriangle } from "lucide-react"

interface HashReputationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hash: string
  type?: string
  originalHash?: string
  originalType?: string
}

interface HashReputationResult {
  malicious: number
  suspicious: number
  harmless: number
  undetected: number
  type?: string
  hash?: string
  details?: any
}

export function HashReputationDialog({ open, onOpenChange, hash, type, originalHash, originalType }: HashReputationDialogProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<HashReputationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [displayOriginalType, setDisplayOriginalType] = useState<string>("")

  const checkReputation = async () => {
    if (!hash) return
    console.log(`[HashRepDialog] Checking hash: ${hash}, type: ${type}`)
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetch("/api/threat-intel/check-hash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash, type }),
      })
      let data: any = null
      try {
        data = await response.json()
      } catch {
        // If response is not JSON, read as text for debugging
        const text = await response.text()
        setError(`Hash reputation error: ${text || "unknown response"}`)
        return
      }

      if (!response.ok || !data?.success) {
        setError(data?.error || `Hash reputation error (status ${response.status})`)
        return
      }

      setResult(data.data)
    } catch (err) {
      setError("Failed to connect to threat intelligence service")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Reset state when dialog opens with new hash/type
    if (open) {
      setResult(null)
      setError(null)
      setDisplayOriginalType(originalType || "")
      // Small delay to ensure state is cleared before fetching
      const timer = setTimeout(() => {
        if (hash) {
          console.log(`[HashRepDialog] Fetching hash: ${hash}, type: ${type}, originalType: ${originalType}`)
          checkReputation()
        }
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [open, hash, type, originalHash, originalType])

  const getThreatLevel = () => {
    if (!result) return null
    const total = result.malicious + result.suspicious + result.harmless + result.undetected
    if (total === 0) return "unknown"
    const maliciousPercent = (result.malicious / total) * 100
    const suspiciousPercent = (result.suspicious / total) * 100
    if (maliciousPercent > 10) return "malicious"
    if (maliciousPercent > 0 || suspiciousPercent > 20) return "suspicious"
    if (result.harmless > 0) return "clean"
    return "unknown"
  }

  const threatLevel = getThreatLevel()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Match IP reputation dialog sizing & layout */}
      <DialogContent className="max-w-2xl z-[130]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Hash Reputation Check
          </DialogTitle>
          <DialogDescription>
            {displayOriginalType === "IMPHASH" ? (
              <>Checking reputation for IMPHASH via SHA256: <code className="font-mono font-semibold">{hash}</code></>
            ) : (
              <>Checking reputation for hash: <code className="font-mono font-semibold">{hash}</code></>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-sm text-muted-foreground">Checking VirusTotal...</span>
            </div>
          )}

          {error && (() => {
            const lower = (error || "").toString().toLowerCase()
            const isNotFound = lower.includes('notfound') || lower.includes('not found') || lower.includes('not_found')
            if (isNotFound) {
              return (
                <Card className="border-gray-200 bg-gray-50">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-2">
                      <ShieldQuestion className="h-5 w-5 text-gray-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">No record on VirusTotal</p>
                        <p className="text-sm text-muted-foreground">VirusTotal has no existing record for this hash. No engines reported detections.</p>
                        <p className="text-xs text-muted-foreground mt-2">Hash: <code className="font-mono">{hash}</code></p>
                        <div className="mt-3 flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => {
                            try { window.open(`https://www.virustotal.com/gui/search/${encodeURIComponent(hash)}`, '_blank') } catch { }
                          }}>
                            Open on VirusTotal
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { checkReputation() }}>
                            Recheck
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            }
            return (
              <Card className="border-red-200 bg-red-50 dark:bg-red-950">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-900 dark:text-red-200">Error</p>
                      <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })()}

          {result && (
            <>
              {/* Threat Level Summary */}
              <Card className={`${
                threatLevel === "malicious" ? "border-red-500 bg-red-50 dark:bg-red-950" :
                threatLevel === "suspicious" ? "border-orange-500 bg-orange-50 dark:bg-orange-950" :
                threatLevel === "clean" ? "border-green-500 bg-green-50 dark:bg-green-950" :
                "border-gray-500 bg-gray-50 dark:bg-gray-950"
              }`}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    {threatLevel === "malicious" && <ShieldAlert className="h-8 w-8 text-red-600" />}
                    {threatLevel === "suspicious" && <ShieldQuestion className="h-8 w-8 text-orange-600" />}
                    {threatLevel === "clean" && <ShieldCheck className="h-8 w-8 text-green-600" />}
                    {threatLevel === "unknown" && <ShieldQuestion className="h-8 w-8 text-gray-600" />}
                    
                    <div>
                      <p className="text-lg font-semibold">
                        {threatLevel === "malicious" && "⚠️ Malicious File Detected"}
                        {threatLevel === "suspicious" && "⚠️ Suspicious File"}
                        {threatLevel === "clean" && "✅ Clean File"}
                        {threatLevel === "unknown" && "❓ Unknown Reputation"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Based on VirusTotal community analysis
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Detailed Statistics */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Detection Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-950/50">
                      <span className="text-sm font-medium">Malicious</span>
                      <Badge variant="destructive" className="text-base font-bold">
                        {result.malicious}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 rounded-lg bg-orange-50 dark:bg-orange-950/50">
                      <span className="text-sm font-medium">Suspicious</span>
                      <Badge variant="outline" className="text-base font-bold text-orange-600 border-orange-600">
                        {result.suspicious}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-950/50">
                      <span className="text-sm font-medium">Harmless</span>
                      <Badge variant="outline" className="text-base font-bold text-green-600 border-green-600">
                        {result.harmless}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-950/50">
                      <span className="text-sm font-medium">Undetected</span>
                      <Badge variant="outline" className="text-base font-bold">
                        {result.undetected}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/50">
                    <p className="text-xs text-blue-900 dark:text-blue-200">
                      <strong>Total Engines:</strong> {result.malicious + result.suspicious + result.harmless + result.undetected}
                    </p>
                    <p className="text-xs text-blue-900 dark:text-blue-200 mt-1">
                      <strong>Detection Rate:</strong> {(
                        ((result.malicious + result.suspicious) / 
                        (result.malicious + result.suspicious + result.harmless + result.undetected)) * 100
                      ).toFixed(1)}% flagged this hash as malicious or suspicious
                    </p>
                    {displayOriginalType === "IMPHASH" && (
                      <p className="text-[11px] text-blue-900 dark:text-blue-200 mt-1">
                        IMPHASH was looked up via its SHA256: <code className="font-mono">{hash}</code>
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Recommendation */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recommendation</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">
                    {threatLevel === "malicious" && (
                      <>
                        <strong className="text-red-600">⚠️ High Risk:</strong> This file hash is flagged as malicious by multiple engines. 
                        Consider quarantining related files and investigating any associated activity.
                      </>
                    )}
                    {threatLevel === "suspicious" && (
                      <>
                        <strong className="text-orange-600">⚠️ Medium Risk:</strong> This hash shows suspicious indicators. 
                        Monitor related hosts/files closely and consider deeper analysis.
                      </>
                    )}
                    {threatLevel === "clean" && (
                      <>
                        <strong className="text-green-600">✅ Low Risk:</strong> No malicious signals detected. 
                        Continue standard monitoring.
                      </>
                    )}
                    {threatLevel === "unknown" && (
                      <>
                        <strong className="text-gray-600">❓ Unknown:</strong> Not enough data. 
                        Consider submitting the file to VirusTotal and monitor for updates.
                      </>
                    )}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
