"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  SparklesIcon,
  SaveIcon,
  ClockIcon,
  Loader2Icon,
  PlusIcon,
  CheckIcon,
  TrashIcon,
  FileTextIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react"
import { SafeDate } from "@/components/ui/safe-date"

interface TicketDraft {
  id: string
  caseId: string
  content: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

interface TicketDraftDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  caseData: any
  alerts?: any[]
}

export function TicketDraftDialog({ open, onOpenChange, caseData, alerts }: TicketDraftDialogProps) {
  const [draftContent, setDraftContent] = useState("")
  const [existingDrafts, setExistingDrafts] = useState<TicketDraft[]>([])
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingDrafts, setLoadingDrafts] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const caseId = caseData?.id
  const integrationSource = caseData?.integration?.source
  const integrationName = caseData?.integration?.name || ""

  const fetchDrafts = useCallback(async () => {
    if (!caseId) return
    setLoadingDrafts(true)
    try {
      const res = await fetch(`/api/cases/${caseId}/ticket-drafts`)
      const data = await res.json()
      if (data.success) {
        setExistingDrafts(data.data || [])
      }
    } catch (err) {
      console.error("[TicketDraft] Failed to fetch drafts:", err)
    } finally {
      setLoadingDrafts(false)
    }
  }, [caseId])

  useEffect(() => {
    if (open && caseId) {
      fetchDrafts()
    }
  }, [open, caseId, fetchDrafts])

  // When history list loads and draft content is empty, load the most recent draft
  useEffect(() => {
    if (existingDrafts.length > 0 && !draftContent && !activeDraftId) {
      const latest = existingDrafts[0]
      setDraftContent(latest.content)
      setActiveDraftId(latest.id)
    }
  }, [existingDrafts, draftContent, activeDraftId])

  const handleGenerate = async () => {
    if (!caseData) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch("/api/cases/ticket-draft/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseData,
          integrationSource,
          integrationName,
          alerts: alerts || [],
        }),
      })
      const data = await res.json()
      if (data.success && data.data?.draft) {
        setDraftContent(data.data.draft)
        setActiveDraftId(null) // new unsaved draft
      } else {
        setError(data.error || "Gagal generate draft")
      }
    } catch (err) {
      setError("Koneksi ke LLM gagal. Pastikan OpenAI API key sudah dikonfigurasi.")
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!draftContent.trim() || !caseId) return
    setSaving(true)
    setError(null)
    try {
      if (activeDraftId) {
        // Update existing
        const res = await fetch(`/api/cases/${caseId}/ticket-drafts/${activeDraftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: draftContent }),
        })
        const data = await res.json()
        if (data.success) {
          await fetchDrafts()
          setSaveSuccess(true)
          setTimeout(() => setSaveSuccess(false), 2000)
        } else {
          setError(data.error || "Gagal menyimpan draft")
        }
      } else {
        // Create new
        const res = await fetch(`/api/cases/${caseId}/ticket-drafts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: draftContent,
            integrationSource,
          }),
        })
        const data = await res.json()
        if (data.success) {
          setActiveDraftId(data.data.id)
          await fetchDrafts()
          setSaveSuccess(true)
          setTimeout(() => setSaveSuccess(false), 2000)
        } else {
          setError(data.error || "Gagal menyimpan draft")
        }
      }
    } catch (err) {
      setError("Gagal menyimpan draft ke database")
    } finally {
      setSaving(false)
    }
  }

  const handleLoadDraft = (draft: TicketDraft) => {
    setDraftContent(draft.content)
    setActiveDraftId(draft.id)
    setShowHistory(false)
  }

  const handleDeleteDraft = async (draftId: string) => {
    try {
      const res = await fetch(`/api/cases/${caseId}/ticket-drafts/${draftId}`, { method: "DELETE" })
      if (res.ok) {
        if (activeDraftId === draftId) {
          setActiveDraftId(null)
          setDraftContent("")
        }
        await fetchDrafts()
      }
    } catch (err) {
      console.error("[TicketDraft] Delete error:", err)
    }
  }

  const handleNewDraft = () => {
    setDraftContent("")
    setActiveDraftId(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[95vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <FileTextIcon className="h-5 w-5 text-blue-500" />
            Create a Ticket
          </DialogTitle>
          <DialogDescription>
            Buat draft tiket notifikasi untuk{" "}
            <span className="font-medium text-foreground">
              #{caseData?.ticketId || caseData?.id} – {caseData?.name}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-6 py-3 border-b bg-muted/30">
            <Button
              size="sm"
              variant="default"
              onClick={handleGenerate}
              disabled={generating}
              className="gap-1.5"
            >
              {generating ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <SparklesIcon className="h-4 w-4" />
              )}
              {generating ? "Generating..." : "Generate dengan AI"}
            </Button>

            <Button
              size="sm"
              variant={saveSuccess ? "default" : "outline"}
              onClick={handleSave}
              disabled={saving || !draftContent.trim()}
              className={`gap-1.5 ${saveSuccess ? "bg-green-600 hover:bg-green-700 text-white border-green-600" : ""}`}
            >
              {saving ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : saveSuccess ? (
                <CheckIcon className="h-4 w-4" />
              ) : (
                <SaveIcon className="h-4 w-4" />
              )}
              {saving ? "Saving..." : saveSuccess ? "Tersimpan!" : activeDraftId ? "Update Draft" : "Save Draft"}
            </Button>

            {existingDrafts.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowHistory(!showHistory)}
                className="gap-1.5 ml-auto"
              >
                <ClockIcon className="h-4 w-4" />
                Riwayat ({existingDrafts.length})
                {showHistory ? <ChevronUpIcon className="h-3 w-3" /> : <ChevronDownIcon className="h-3 w-3" />}
              </Button>
            )}

            {activeDraftId && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleNewDraft}
                className="gap-1.5"
                title="Buat draft baru"
              >
                <PlusIcon className="h-4 w-4" />
                Baru
              </Button>
            )}
          </div>

          {/* Draft History Panel */}
          {showHistory && existingDrafts.length > 0 && (
            <div className="px-6 py-3 border-b bg-muted/20">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Riwayat Draft Tersimpan</p>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {existingDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className={`flex items-center justify-between rounded-md px-3 py-2 cursor-pointer transition-colors hover:bg-accent group ${
                      activeDraftId === draft.id ? "bg-accent ring-1 ring-blue-500" : ""
                    }`}
                    onClick={() => handleLoadDraft(draft)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {activeDraftId === draft.id && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">Aktif</Badge>
                      )}
                      <span className="text-xs text-muted-foreground truncate">
                        <SafeDate date={draft.updatedAt} format="relative" />
                        {draft.createdBy && ` · ${draft.createdBy}`}
                      </span>
                      <span className="text-xs truncate text-foreground">
                        {draft.content.substring(0, 60)}...
                      </span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-600"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteDraft(draft.id)
                      }}
                    >
                      <TrashIcon className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mx-6 mt-3 px-3 py-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Draft Editor */}
          <div className="flex-1 overflow-hidden px-6 py-4">
            {generating ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <Loader2Icon className="h-8 w-8 animate-spin text-blue-500" />
                <p className="text-sm">AI sedang menyusun draft tiket...</p>
              </div>
            ) : (
              <Textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                placeholder={
                  "Klik \"Generate dengan AI\" untuk membuat draft secara otomatis,\natau tulis draft tiket di sini secara manual."
                }
                className="h-full min-h-[500px] font-mono text-sm resize-none leading-relaxed"
              />
            )}
          </div>

          {/* Footer status */}
          <div className="px-6 pb-4 flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {integrationSource?.toUpperCase() || "UNKNOWN"}
              </Badge>
              <span>{integrationName}</span>
            </div>
            {activeDraftId && (
              <span className="flex items-center gap-1">
                <CheckIcon className="h-3 w-3 text-green-500" />
                Draft tersimpan di database
              </span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
