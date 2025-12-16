"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, ShieldAlert, ShieldCheck, ShieldQuestion, AlertTriangle } from "lucide-react"

interface IpReputationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ip: string
}

interface ReputationResult {
  malicious: number
  suspicious: number
  harmless: number
  undetected: number
}

export function IpReputationDialog({ open, onOpenChange, ip }: IpReputationDialogProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReputationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkReputation = async () => {
    if (!ip) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch("/api/threat-intel/check-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip }),
      })

      const data = await response.json()

      if (data.success) {
        setResult(data.data)
      } else {
        setError(data.error || "Failed to check IP reputation")
      }
    } catch (err) {
      console.error("Error checking IP reputation:", err)
      setError("Failed to connect to threat intelligence service")
    } finally {
      setLoading(false)
    }
  }

  // Auto-check when dialog opens or IP changes
  useEffect(() => {
    if (open && ip) {
      // Reset state when IP changes
      setResult(null)
      setError(null)
      // Fetch reputation for new IP
      checkReputation()
    }
  }, [open, ip])

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
      {/* High z-index so it overlays the parent alert dialog */}
      <DialogContent className="max-w-2xl z-[130]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            IP Reputation Check
          </DialogTitle>
          <DialogDescription>
            Checking reputation for IP: <code className="font-mono font-semibold">{ip}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-sm text-muted-foreground">Checking VirusTotal...</span>
            </div>
          )}

          {error && (
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
          )}

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
                        {threatLevel === "malicious" && "⚠️ Malicious IP Detected"}
                        {threatLevel === "suspicious" && "⚠️ Suspicious Activity"}
                        {threatLevel === "clean" && "✅ Clean IP"}
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
                      ).toFixed(1)}% flagged this IP as malicious or suspicious
                    </p>
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
                        <strong className="text-red-600">⚠️ High Risk:</strong> This IP has been flagged as malicious by multiple security vendors. 
                        Consider blocking this IP and investigating any related activity immediately.
                      </>
                    )}
                    {threatLevel === "suspicious" && (
                      <>
                        <strong className="text-orange-600">⚠️ Medium Risk:</strong> This IP shows suspicious activity. 
                        Monitor closely and consider additional investigation.
                      </>
                    )}
                    {threatLevel === "clean" && (
                      <>
                        <strong className="text-green-600">✅ Low Risk:</strong> This IP appears to be clean according to current threat intelligence. 
                        Continue standard monitoring procedures.
                      </>
                    )}
                    {threatLevel === "unknown" && (
                      <>
                        <strong className="text-gray-600">❓ Unknown:</strong> Limited information available for this IP. 
                        Consider additional investigation using other threat intelligence sources.
                      </>
                    )}
                  </p>
                </CardContent>
              </Card>
            </>
          )}

          <div className="flex justify-end gap-2">
            {result && (
              <Button variant="outline" onClick={checkReputation} disabled={loading}>
                Recheck
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
