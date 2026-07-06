"use client"

import React, { useState, useEffect, useCallback } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  Search, Plus, FileText, Shield, Info, AlertTriangle,
  Copy, Check, Edit, Trash2, BookOpen, Terminal,
  ExternalLink, RefreshCw, Loader2, X, ChevronDown
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAuth } from "@/lib/auth/auth-context"

// ─── MITRE ATT&CK Dataset ────────────────────────────────────────────────────

interface MitreTechnique {
  tacticId: string
  tacticName: string
  techniqueId: string
  techniqueName: string
}

const MITRE_DATA: MitreTechnique[] = [
  { tacticId: "TA0043", tacticName: "Reconnaissance", techniqueId: "T1595", techniqueName: "Active Scanning" },
  { tacticId: "TA0043", tacticName: "Reconnaissance", techniqueId: "T1592", techniqueName: "Gather Victim Host Information" },
  { tacticId: "TA0043", tacticName: "Reconnaissance", techniqueId: "T1589", techniqueName: "Gather Victim Identity Information" },
  { tacticId: "TA0043", tacticName: "Reconnaissance", techniqueId: "T1593", techniqueName: "Search Open Websites/Domains" },
  { tacticId: "TA0043", tacticName: "Reconnaissance", techniqueId: "T1594", techniqueName: "Search Victim-Owned Websites" },
  { tacticId: "TA0042", tacticName: "Resource Development", techniqueId: "T1583", techniqueName: "Acquire Infrastructure" },
  { tacticId: "TA0042", tacticName: "Resource Development", techniqueId: "T1586", techniqueName: "Compromise Accounts" },
  { tacticId: "TA0042", tacticName: "Resource Development", techniqueId: "T1587", techniqueName: "Develop Capabilities" },
  { tacticId: "TA0042", tacticName: "Resource Development", techniqueId: "T1584", techniqueName: "Compromise Infrastructure" },
  { tacticId: "TA0042", tacticName: "Resource Development", techniqueId: "T1588", techniqueName: "Obtain Capabilities" },
  { tacticId: "TA0001", tacticName: "Initial Access", techniqueId: "T1566", techniqueName: "Phishing" },
  { tacticId: "TA0001", tacticName: "Initial Access", techniqueId: "T1190", techniqueName: "Exploit Public-Facing Application" },
  { tacticId: "TA0001", tacticName: "Initial Access", techniqueId: "T1133", techniqueName: "External Remote Services" },
  { tacticId: "TA0001", tacticName: "Initial Access", techniqueId: "T1195", techniqueName: "Supply Chain Compromise" },
  { tacticId: "TA0001", tacticName: "Initial Access", techniqueId: "T1199", techniqueName: "Trusted Relationship" },
  { tacticId: "TA0002", tacticName: "Execution", techniqueId: "T1059", techniqueName: "Command and Scripting Interpreter" },
  { tacticId: "TA0002", tacticName: "Execution", techniqueId: "T1204", techniqueName: "User Execution" },
  { tacticId: "TA0002", tacticName: "Execution", techniqueId: "T1047", techniqueName: "Windows Management Instrumentation" },
  { tacticId: "TA0002", tacticName: "Execution", techniqueId: "T1569", techniqueName: "System Services" },
  { tacticId: "TA0002", tacticName: "Execution", techniqueId: "T1106", techniqueName: "Native API" },
  { tacticId: "TA0003", tacticName: "Persistence", techniqueId: "T1547", techniqueName: "Boot or Logon Autostart Execution" },
  { tacticId: "TA0003", tacticName: "Persistence", techniqueId: "T1136", techniqueName: "Create Account" },
  { tacticId: "TA0003", tacticName: "Persistence", techniqueId: "T1053", techniqueName: "Scheduled Task/Job" },
  { tacticId: "TA0003", tacticName: "Persistence", techniqueId: "T1574", techniqueName: "Hijack Execution Flow" },
  { tacticId: "TA0003", tacticName: "Persistence", techniqueId: "T1556", techniqueName: "Modify Authentication Process" },
  { tacticId: "TA0004", tacticName: "Privilege Escalation", techniqueId: "T1068", techniqueName: "Exploitation for Privilege Escalation" },
  { tacticId: "TA0004", tacticName: "Privilege Escalation", techniqueId: "T1548", techniqueName: "Abuse Elevation Control Mechanism" },
  { tacticId: "TA0004", tacticName: "Privilege Escalation", techniqueId: "T1055", techniqueName: "Process Injection" },
  { tacticId: "TA0004", tacticName: "Privilege Escalation", techniqueId: "T1574", techniqueName: "Hijack Execution Flow" },
  { tacticId: "TA0004", tacticName: "Privilege Escalation", techniqueId: "T1078", techniqueName: "Valid Accounts" },
  { tacticId: "TA0044", tacticName: "Stealth", techniqueId: "T1036", techniqueName: "Masquerading" },
  { tacticId: "TA0044", tacticName: "Stealth", techniqueId: "T1027", techniqueName: "Obfuscated Files or Information" },
  { tacticId: "TA0044", tacticName: "Stealth", techniqueId: "T1070", techniqueName: "Indicator Removal" },
  { tacticId: "TA0044", tacticName: "Stealth", techniqueId: "T1497", techniqueName: "Virtualization/Sandbox Evasion" },
  { tacticId: "TA0045", tacticName: "Defense Impairment", techniqueId: "T1562", techniqueName: "Impair Defenses" },
  { tacticId: "TA0006", tacticName: "Credential Access", techniqueId: "T1003", techniqueName: "OS Credential Dumping" },
  { tacticId: "TA0006", tacticName: "Credential Access", techniqueId: "T1110", techniqueName: "Brute Force" },
  { tacticId: "TA0006", tacticName: "Credential Access", techniqueId: "T1555", techniqueName: "Credentials from Password Stores" },
  { tacticId: "TA0006", tacticName: "Credential Access", techniqueId: "T1539", techniqueName: "Steal Web Session Information" },
  { tacticId: "TA0006", tacticName: "Credential Access", techniqueId: "T1552", techniqueName: "Unsecured Credentials" },
  { tacticId: "TA0007", tacticName: "Discovery", techniqueId: "T1082", techniqueName: "System Information Discovery" },
  { tacticId: "TA0007", tacticName: "Discovery", techniqueId: "T1016", techniqueName: "System Network Configuration Discovery" },
  { tacticId: "TA0007", tacticName: "Discovery", techniqueId: "T1087", techniqueName: "Account Discovery" },
  { tacticId: "TA0007", tacticName: "Discovery", techniqueId: "T1018", techniqueName: "Remote System Discovery" },
  { tacticId: "TA0007", tacticName: "Discovery", techniqueId: "T1046", techniqueName: "Network Service Discovery" },
  { tacticId: "TA0008", tacticName: "Lateral Movement", techniqueId: "T1021", techniqueName: "Remote Services" },
  { tacticId: "TA0008", tacticName: "Lateral Movement", techniqueId: "T1550", techniqueName: "Use Alternate Authentication Material" },
  { tacticId: "TA0008", tacticName: "Lateral Movement", techniqueId: "T1072", techniqueName: "Software Deployment Tools" },
  { tacticId: "TA0008", tacticName: "Lateral Movement", techniqueId: "T1563", techniqueName: "Remote Service Session Hijacking" },
  { tacticId: "TA0008", tacticName: "Lateral Movement", techniqueId: "T1210", techniqueName: "Exploitation of Remote Services" },
  { tacticId: "TA0009", tacticName: "Collection", techniqueId: "T1005", techniqueName: "Data from Local System" },
  { tacticId: "TA0009", tacticName: "Collection", techniqueId: "T1115", techniqueName: "Clipboard Data" },
  { tacticId: "TA0009", tacticName: "Collection", techniqueId: "T1113", techniqueName: "Screen Capture" },
  { tacticId: "TA0009", tacticName: "Collection", techniqueId: "T1560", techniqueName: "Archive Collected Data" },
  { tacticId: "TA0009", tacticName: "Collection", techniqueId: "T1074", techniqueName: "Data Staged" },
  { tacticId: "TA0011", tacticName: "Command and Control", techniqueId: "T1071", techniqueName: "Application Layer Protocol" },
  { tacticId: "TA0011", tacticName: "Command and Control", techniqueId: "T1105", techniqueName: "Ingress Tool Transfer" },
  { tacticId: "TA0011", tacticName: "Command and Control", techniqueId: "T1568", techniqueName: "Dynamic Resolution" },
  { tacticId: "TA0011", tacticName: "Command and Control", techniqueId: "T1090", techniqueName: "Proxy" },
  { tacticId: "TA0011", tacticName: "Command and Control", techniqueId: "T1102", techniqueName: "Web Service" },
  { tacticId: "TA0010", tacticName: "Exfiltration", techniqueId: "T1041", techniqueName: "Exfiltration Over C2 Channel" },
  { tacticId: "TA0010", tacticName: "Exfiltration", techniqueId: "T1567", techniqueName: "Exfiltration Over Web Service" },
  { tacticId: "TA0010", tacticName: "Exfiltration", techniqueId: "T1020", techniqueName: "Automated Exfiltration" },
  { tacticId: "TA0010", tacticName: "Exfiltration", techniqueId: "T1048", techniqueName: "Exfiltration Over Alternative Protocol" },
  { tacticId: "TA0010", tacticName: "Exfiltration", techniqueId: "T1052", techniqueName: "Exfiltration Over Physical Medium" },
  { tacticId: "TA0040", tacticName: "Impact", techniqueId: "T1486", techniqueName: "Data Encrypted for Impact" },
  { tacticId: "TA0040", tacticName: "Impact", techniqueId: "T1485", techniqueName: "Data Destruction" },
  { tacticId: "TA0040", tacticName: "Impact", techniqueId: "T1489", techniqueName: "Service Stop" },
  { tacticId: "TA0040", tacticName: "Impact", techniqueId: "T1498", techniqueName: "Network Denial of Service" },
  { tacticId: "TA0040", tacticName: "Impact", techniqueId: "T1565", techniqueName: "Data Manipulation" },
]

// Unique tactics from dataset
const UNIQUE_TACTICS = Array.from(new Map(MITRE_DATA.map(m => [m.tacticId, { id: m.tacticId, name: m.tacticName }])).values())

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlaybookTenant {
  id: string
  tenantName: string
}

interface Playbook {
  id: string
  playbookId: string
  ruleId: string
  useCaseName: string
  status: string
  severity: string
  description: string
  detectionType: string
  logSource: string
  eventIdType: string
  mitreTechniqueIds: string[]
  mitreTechniqueNames: string[]
  mitreTacticIds: string[]
  mitreTacticNames: string[]
  detectionLogic: string
  howToCheck: string
  decision: string
  recommendation: string
  descriptionTemplate?: string
  evidenceToCollect?: string
  createdAt: string
  updatedAt: string
  createdBy?: string
  tenants: PlaybookTenant[]
}

type FormData = {
  playbookId: string
  ruleId: string
  useCaseName: string
  tenants: string[]       // Array of tenant name strings
  status: string
  severity: string
  description: string
  detectionType: string
  logSource: string
  eventIdType: string
  selectedTechniques: string[]  // technique IDs
  selectedTactics: string[]     // tactic IDs
  detectionLogic: string
  howToCheck: string
  decision: string
  recommendation: string
  descriptionTemplate: string
  evidenceToCollect: string
}

const EMPTY_FORM: FormData = {
  playbookId: "", ruleId: "", useCaseName: "", tenants: [],
  status: "enable", severity: "High",
  description: "", detectionType: "", logSource: "", eventIdType: "",
  selectedTechniques: [], selectedTactics: [],
  detectionLogic: "", howToCheck: "", decision: "", recommendation: "",
  descriptionTemplate: "", evidenceToCollect: ""
}

// ─── Helper Components ────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const colorMap: Record<string, string> = {
    Critical: "bg-rose-500/20 text-rose-400 border border-rose-500/30",
    High: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
    Medium: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
    Low: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    // New Ranges
    "Low - Medium": "bg-emerald-500/10 text-emerald-400 border border-amber-500/20",
    "Low - High": "bg-emerald-500/10 text-orange-400 border border-orange-500/20",
    "Low - Critical": "bg-emerald-500/10 text-rose-400 border border-rose-500/20",
    "Medium - High": "bg-amber-500/10 text-orange-400 border border-orange-500/20",
    "Medium - Critical": "bg-amber-500/10 text-rose-400 border border-rose-500/20",
    "High - Critical": "bg-orange-500/10 text-rose-400 border border-rose-500/20",
  }
  return <Badge className={colorMap[severity] ?? "bg-muted/60 text-muted-foreground border border-border/30"}>{severity}</Badge>
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={status === "enable"
      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
      : "bg-muted/40 text-muted-foreground border border-border/30"
    }>
      {status === "enable" ? "Enabled" : "Disabled"}
    </Badge>
  )
}

// Multi-select dropdown for MITRE techniques
function MitreTechniqueSelect({ value, onChange }: { value: string[], onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = React.useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const filtered = MITRE_DATA.filter(m =>
    m.techniqueId.toLowerCase().includes(search.toLowerCase()) ||
    m.techniqueName.toLowerCase().includes(search.toLowerCase())
  )

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  }

  const selectedLabels = value.map(id => {
    const m = MITRE_DATA.find(m => m.techniqueId === id)
    return m ? `${m.techniqueId} – ${m.techniqueName}` : id
  })

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm hover:border-border transition"
      >
        <span className="truncate text-left">
          {value.length === 0
            ? <span className="text-muted-foreground">Select technique(s)...</span>
            : <span>{value.length} technique{value.length > 1 ? "s" : ""} selected</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-[60] mt-1 w-full bg-card border border-border rounded-lg shadow-2xl flex flex-col" style={{ maxHeight: "260px" }}>
          <div className="p-2 border-b border-border flex-shrink-0">
            <Input
              placeholder="Search technique..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-7 text-xs bg-background border-border text-foreground"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto flex-1" style={{ minHeight: 0 }}>
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">No techniques found</div>
            ) : filtered.map(m => (
              <div
                key={`${m.tacticId}-${m.techniqueId}`}
                onMouseDown={e => { e.preventDefault(); toggle(m.techniqueId) }}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted dark:hover:bg-slate-800 text-xs ${value.includes(m.techniqueId) ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300" : "text-foreground"
                  }`}
              >
                <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${value.includes(m.techniqueId) ? "bg-indigo-500 border-indigo-500" : "border-slate-600"
                  }`}>
                  {value.includes(m.techniqueId) && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
                <span className="font-mono text-indigo-600 dark:text-indigo-400 shrink-0">{m.techniqueId}</span>
                <span className="text-muted-foreground shrink-0">–</span>
                <span className="truncate">{m.techniqueName}</span>
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-border flex-shrink-0 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">{value.length} selected</span>
            {value.length > 0 && (
              <button type="button" onMouseDown={e => { e.preventDefault(); onChange([]) }} className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300">Clear all</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Multi-select dropdown for MITRE tactics
function MitreTacticSelect({ value, onChange }: { value: string[], onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm hover:border-border transition"
      >
        <span className="truncate text-left">
          {value.length === 0
            ? <span className="text-muted-foreground">Select tactic(s)...</span>
            : <span>{value.length} tactic{value.length > 1 ? "s" : ""} selected</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-[60] mt-1 w-full bg-card border border-border rounded-lg shadow-2xl flex flex-col" style={{ maxHeight: "240px" }}>
          <div className="overflow-y-auto flex-1" style={{ minHeight: 0 }}>
            {UNIQUE_TACTICS.map(t => (
              <div
                key={t.id}
                onMouseDown={e => { e.preventDefault(); toggle(t.id) }}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted dark:hover:bg-slate-800 text-xs ${value.includes(t.id) ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300" : "text-foreground"
                  }`}
              >
                <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${value.includes(t.id) ? "bg-indigo-500 border-indigo-500" : "border-slate-600"
                  }`}>
                  {value.includes(t.id) && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
                <span className="font-mono text-purple-600 dark:text-purple-400 shrink-0">{t.id}</span>
                <span className="text-muted-foreground shrink-0">–</span>
                <span>{t.name}</span>
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-border flex-shrink-0 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">{value.length} selected</span>
            {value.length > 0 && (
              <button type="button" onMouseDown={e => { e.preventDefault(); onChange([]) }} className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300">Clear all</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Tenant combo: pick existing + add new inline
function TenantSelect({
  value, onChange, existingTenants
}: { value: string[], onChange: (v: string[]) => void, existingTenants: string[] }) {
  const [open, setOpen] = useState(false)
  const [addMode, setAddMode] = useState(false)
  const [newName, setNewName] = useState("")
  const ref = React.useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setAddMode(false)
        setNewName("")
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const toggle = (name: string) => {
    onChange(value.includes(name) ? value.filter(v => v !== name) : [...value, name])
  }

  const confirmAdd = () => {
    const trimmed = newName.trim()
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed])
    setNewName("")
    setAddMode(false)
  }

  const remove = (name: string) => onChange(value.filter(v => v !== name))

  // Options = existing tenants from DB + any currently selected
  const allOptions = Array.from(new Set([...existingTenants, ...value]))

  return (
    <div className="relative" ref={ref}>
      {/* Trigger: shows selected tags and opens dropdown */}
      <div
        onClick={e => { e.stopPropagation(); setOpen(prev => !prev) }}
        className="min-h-[40px] flex flex-wrap gap-1.5 px-3 py-2 rounded-md border border-border bg-background cursor-pointer hover:border-border transition focus-within:border-indigo-500"
      >
        {value.length === 0 && (
          <span className="text-muted-foreground text-sm self-center">Select or add tenant(s)...</span>
        )}
        {value.map(t => (
          <span key={t} className="flex items-center gap-1 bg-indigo-100 text-indigo-700 border border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800/60 text-xs px-2 py-0.5 rounded-full">
            {t}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); remove(t) }}
              className="text-indigo-600 hover:text-rose-600 dark:text-indigo-400 dark:hover:text-rose-400"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <ChevronDown className={`h-4 w-4 text-muted-foreground self-center ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      {/* Dropdown — onClick stopPropagation prevents clicks inside from closing it */}
      {open && (
        <div
          onClick={e => e.stopPropagation()}
          className="absolute z-[60] mt-1 w-full bg-card border border-border rounded-lg shadow-2xl flex flex-col"
          style={{ maxHeight: "240px" }}
        >
          {/* Existing tenant options */}
          <div className="overflow-y-auto flex-1" style={{ minHeight: 0 }}>
            {allOptions.length === 0 ? (
              <div className="px-3 py-3 text-xs text-muted-foreground text-center">No tenants yet — add one below</div>
            ) : allOptions.map(t => (
              <div
                key={t}
                onClick={() => toggle(t)}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted dark:hover:bg-slate-800 text-xs ${
                  value.includes(t) ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300" : "text-foreground"
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                  value.includes(t) ? "bg-indigo-500 border-indigo-500" : "border-slate-600"
                }`}>
                  {value.includes(t) && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
                {t}
              </div>
            ))}
          </div>

          {/* Add new tenant */}
          <div className="border-t border-border flex-shrink-0">
            {addMode ? (
              <div className="flex items-center gap-2 p-2">
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { e.preventDefault(); confirmAdd() }
                    if (e.key === "Escape") { setAddMode(false); setNewName("") }
                  }}
                  placeholder="Tenant name..."
                  className="flex-1 bg-background dark:bg-slate-950 border border-border dark:border-slate-800 rounded px-2 py-1 text-xs text-foreground outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={confirmAdd}
                  className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setAddMode(false); setNewName("") }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddMode(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-indigo-400 hover:bg-muted dark:hover:bg-slate-800 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                Add tenant
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PlaybookPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === "administrator"

  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [severityFilter, setSeverityFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [tenantFilter, setTenantFilter] = useState("all")
  const [copied, setCopied] = useState(false)

  // Dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create")
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const selectedPlaybook = playbooks.find(p => p.id === selectedId) ?? null

  // ── Fetch ──
  const fetchPlaybooks = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set("search", searchQuery)
      if (severityFilter !== "all") params.set("severity", severityFilter)
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (tenantFilter !== "all") params.set("tenant", tenantFilter)

      const res = await fetch(`/api/playbooks?${params}`, { credentials: "include" })
      const data = await res.json()
      if (data.success) {
        setPlaybooks(data.playbooks)
        if (data.playbooks.length && !selectedId) setSelectedId(data.playbooks[0].id)
      }
    } catch (err) {
      console.error("Failed to fetch playbooks:", err)
    } finally {
      setLoading(false)
    }
  }, [searchQuery, severityFilter, statusFilter, tenantFilter]) // eslint-disable-line

  useEffect(() => { fetchPlaybooks() }, [fetchPlaybooks])

  // ── Copy detection logic ──
  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Open create dialog – auto-generate Playbook ID from server ──
  const openCreate = async () => {
    // Fetch all playbooks to determine next sequential ID reliably
    let nextId = "PB-001"
    try {
      const res = await fetch("/api/playbooks?search=", { credentials: "include" })
      const data = await res.json()
      if (data.success) {
        const ids = (data.playbooks as Playbook[])
          .map(p => p.playbookId)
          .filter(id => /^PB-\d+$/.test(id))
          .map(id => parseInt(id.replace("PB-", ""), 10))
        const maxNum = ids.length > 0 ? Math.max(...ids) : 0
        nextId = `PB-${String(maxNum + 1).padStart(3, "0")}`
      }
    } catch { /* fallback already set */ }
    setFormData({ ...EMPTY_FORM, playbookId: nextId })
    setFormError("")
    setDialogMode("create")
    setIsDialogOpen(true)
  }

  // ── Open edit dialog ──
  const openEdit = () => {
    if (!selectedPlaybook) return
    const p = selectedPlaybook
    setFormData({
      playbookId: p.playbookId,
      ruleId: p.ruleId,
      useCaseName: p.useCaseName,
      tenants: p.tenants.map(t => t.tenantName),
      status: p.status,
      severity: p.severity,
      description: p.description,
      detectionType: p.detectionType,
      logSource: p.logSource,
      eventIdType: p.eventIdType,
      selectedTechniques: p.mitreTechniqueIds,
      selectedTactics: p.mitreTacticIds,
      detectionLogic: p.detectionLogic,
      howToCheck: p.howToCheck,
      decision: p.decision,
      recommendation: p.recommendation,
      descriptionTemplate: p.descriptionTemplate ?? "",
      evidenceToCollect: p.evidenceToCollect ?? "",
    })
    setFormError("")
    setDialogMode("edit")
    setIsDialogOpen(true)
  }

  // ── Save ──
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError("")

    // Build MITRE names from selected IDs
    const mitreTechniqueNames = formData.selectedTechniques.map(id => {
      return MITRE_DATA.find(m => m.techniqueId === id)?.techniqueName ?? id
    })
    const mitreTacticNames = formData.selectedTactics.map(id => {
      return UNIQUE_TACTICS.find(t => t.id === id)?.name ?? id
    })

    const payload = {
      playbookId: formData.playbookId,
      ruleId: formData.ruleId,
      useCaseName: formData.useCaseName,
      tenants: formData.tenants,
      status: formData.status,
      severity: formData.severity,
      description: formData.description,
      detectionType: formData.detectionType,
      logSource: formData.logSource,
      eventIdType: formData.eventIdType,
      mitreTechniqueIds: formData.selectedTechniques,
      mitreTechniqueNames,
      mitreTacticIds: formData.selectedTactics,
      mitreTacticNames,
      detectionLogic: formData.detectionLogic,
      howToCheck: formData.howToCheck,
      decision: formData.decision,
      recommendation: formData.recommendation,
      descriptionTemplate: formData.descriptionTemplate || null,
      evidenceToCollect: formData.evidenceToCollect || null,
    }

    try {
      let res: Response
      if (dialogMode === "create") {
        res = await fetch("/api/playbooks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        })
      } else {
        res = await fetch(`/api/playbooks/${selectedPlaybook!.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        })
      }

      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error ?? "Failed to save playbook")
        return
      }

      setIsDialogOpen(false)
      await fetchPlaybooks()
      if (dialogMode === "create") setSelectedId(data.playbook.id)
    } catch (err) {
      setFormError("Network error, please try again.")
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ──
  const handleDelete = async () => {
    if (!selectedPlaybook) return
    if (!confirm(`Delete playbook "${selectedPlaybook.playbookId}"? This cannot be undone.`)) return

    try {
      const res = await fetch(`/api/playbooks/${selectedPlaybook.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (res.ok) {
        setSelectedId(null)
        await fetchPlaybooks()
      }
    } catch (err) {
      console.error("Failed to delete playbook:", err)
    }
  }

  // ── Unique tenants across all playbooks for filter ──
  const allTenants = Array.from(new Set(playbooks.flatMap(p => p.tenants.map(t => t.tenantName))))

  // ── Render ──
  return (
    <div className="container mx-auto p-6 space-y-6 min-h-screen">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Alert Handling Playbooks
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Standard Operating Procedures (SOP) for L1/L2 alert triage, decision, and containment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={fetchPlaybooks} variant="outline" size="sm" className="border-border text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {isAdmin && (
            <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20">
              <Plus className="h-4 w-4 mr-2" />
              Add Playbook
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── Left: Directory ── */}
        <div className="lg:col-span-4">
          <Card className="bg-card dark:bg-slate-900 border-border dark:border-slate-800 shadow-xl">
            <CardHeader className="p-4 border-b border-border/80 dark:border-slate-800/80">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <BookOpen className="h-5 w-5" />
                Playbook Directory
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search playbooks..."
                  className="pl-9 bg-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-indigo-500 text-sm"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Filters */}
              <div className="grid grid-cols-3 gap-2">
                <Select value={severityFilter} onValueChange={setSeverityFilter}>
                  <SelectTrigger className="bg-background border-border text-xs text-foreground h-8">
                    <SelectValue placeholder="Severity" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border text-foreground">
                    <SelectItem value="all">All Sev.</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Low - Medium">Low - Medium</SelectItem>
                    <SelectItem value="Low - High">Low - High</SelectItem>
                    <SelectItem value="Low - Critical">Low - Critical</SelectItem>
                    <SelectItem value="Medium - High">Medium - High</SelectItem>
                    <SelectItem value="Medium - Critical">Medium - Critical</SelectItem>
                    <SelectItem value="High - Critical">High - Critical</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-background border-border text-xs text-foreground h-8">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border text-foreground">
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="enable">Enabled</SelectItem>
                    <SelectItem value="disable">Disabled</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={tenantFilter} onValueChange={setTenantFilter}>
                  <SelectTrigger className="bg-background border-border text-xs text-foreground h-8">
                    <SelectValue placeholder="Tenant" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border text-foreground">
                    <SelectItem value="all">All Tenants</SelectItem>
                    {allTenants.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* List */}
              <ScrollArea className="h-[520px] pr-1">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                  </div>
                ) : playbooks.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    {isAdmin ? "No playbooks yet. Click \"Add Playbook\" to create one." : "No playbooks found."}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {playbooks.map(p => (
                      <div
                        key={p.id}
                        onClick={() => setSelectedId(p.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedId === p.id
                          ? "bg-muted border-indigo-500 shadow-md shadow-indigo-500/10"
                          : "bg-background hover:bg-muted dark:hover:bg-slate-800/50 border-border dark:border-slate-800"
                          }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-muted border border-border rounded text-indigo-600 dark:text-indigo-400">
                            {p.playbookId}
                          </span>
                          <div className="flex gap-1">
                            <SeverityBadge severity={p.severity} />
                            <StatusBadge status={p.status} />
                          </div>
                        </div>
                        <h3 className="font-semibold text-sm line-clamp-1 text-foreground">{p.ruleId}</h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{p.useCaseName}</p>
                        {p.tenants.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {p.tenants.slice(0, 3).map(t => (
                              <span key={t.id} className="text-[10px] bg-muted border border-border text-muted-foreground px-1.5 py-0.5 rounded">
                                {t.tenantName}
                              </span>
                            ))}
                            {p.tenants.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">+{p.tenants.length - 3} more</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* ── Right: Detail ── */}
        <div className="lg:col-span-8">
          {!selectedPlaybook ? (
            <div className="h-64 flex items-center justify-center border border-border rounded-xl bg-card/50 dark:bg-slate-900/50 text-muted-foreground text-sm">
              {loading ? <Loader2 className="h-6 w-6 animate-spin text-indigo-500" /> : "Select a playbook to view its SOP."}
            </div>
          ) : (
            <div className="space-y-5">
              {/* ── Hero Header Card ── */}
              <Card className="bg-card dark:bg-slate-900 border-border dark:border-slate-800 shadow-xl overflow-hidden relative">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-indigo-500 via-purple-500 to-pink-500" />
                <CardContent className="p-5">
                  {/* Top bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3 mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold px-2 py-1 bg-background dark:bg-slate-950 border border-border dark:border-slate-800 rounded-md text-indigo-600 dark:text-indigo-400">
                        {selectedPlaybook.playbookId}
                      </span>
                      <SeverityBadge severity={selectedPlaybook.severity} />
                      <StatusBadge status={selectedPlaybook.status} />
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <Button onClick={openEdit} size="sm" variant="outline" className="border-border hover:bg-muted dark:hover:bg-slate-800 text-xs h-8">
                          <Edit className="h-3.5 w-3.5 mr-1" />Edit
                        </Button>
                        <Button onClick={handleDelete} size="sm" className="bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-300 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-900/60 dark:border-rose-800 text-xs h-8">
                          <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Title & Meta */}
                  <h2 className="text-xl font-bold text-foreground mb-1">{selectedPlaybook.ruleId}</h2>
                  <p className="text-muted-foreground text-sm mb-4">{selectedPlaybook.description}</p>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs bg-muted/50 p-3 rounded-lg border border-border/80 dark:border-slate-800/80">
                    <div>
                      <span className="text-muted-foreground font-bold block mb-0.5 uppercase">Use Case</span>
                      <span className="text-foreground">{selectedPlaybook.useCaseName}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-bold block mb-0.5 uppercase">Detection Type</span>
                      <span className="text-foreground">{selectedPlaybook.detectionType}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-bold block mb-0.5 uppercase">Log Source</span>
                      <span className="text-foreground">{selectedPlaybook.logSource}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground font-bold block mb-0.5 uppercase">Event ID / Log Type</span>
                      <span className="text-foreground font-mono">{selectedPlaybook.eventIdType}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground font-bold block mb-0.5 uppercase">Tenants</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedPlaybook.tenants.length > 0
                          ? selectedPlaybook.tenants.map(t => (
                            <span key={t.id} className="bg-indigo-100 border border-indigo-300 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800/50 dark:text-indigo-300 px-1.5 py-0.5 rounded text-[10px]">
                              {t.tenantName}
                            </span>
                          ))
                          : <span className="text-muted-foreground">—</span>
                        }
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Tabs ── */}
              <Tabs defaultValue="workflow" className="w-full">
                <TabsList className="bg-card dark:bg-slate-900 border border-border p-1 rounded-xl">
                  <TabsTrigger value="workflow" className="rounded-lg data-[state=active]:bg-muted data-[state=active]:text-foreground text-xs">
                    SOP Workflow
                  </TabsTrigger>
                  <TabsTrigger value="detection" className="rounded-lg data-[state=active]:bg-muted data-[state=active]:text-foreground text-xs">
                    <Terminal className="h-3.5 w-3.5 mr-1.5" />Detection Logic
                  </TabsTrigger>
                  <TabsTrigger value="intel" className="rounded-lg data-[state=active]:bg-muted data-[state=active]:text-foreground text-xs">
                    <Shield className="h-3.5 w-3.5 mr-1.5" />MITRE Intel
                  </TabsTrigger>
                </TabsList>

                {/* ── Workflow Tab ── */}
                <TabsContent value="workflow" className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* How to Check */}
                    <Card className="bg-card dark:bg-slate-900 border-border dark:border-slate-800">
                      <CardHeader className="p-4 pb-2">
                        <div className="text-[10px] text-muted-foreground font-bold tracking-widest uppercase">STEP 1</div>
                        <CardTitle className="text-sm text-foreground">How to Check</CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0 text-sm text-foreground whitespace-pre-line leading-relaxed">
                        {selectedPlaybook.howToCheck}
                      </CardContent>
                    </Card>

                    {/* Decision */}
                    <Card className="bg-card dark:bg-slate-900 border-border dark:border-slate-800">
                      <CardHeader className="p-4 pb-2">
                        <div className="text-[10px] text-muted-foreground font-bold tracking-widest uppercase">STEP 2</div>
                        <CardTitle className="text-sm text-foreground">Decision</CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <div className="bg-indigo-50 border border-indigo-200 rounded p-3 text-sm text-indigo-900 italic whitespace-pre-line leading-relaxed dark:bg-indigo-950/20 dark:border-indigo-900/40 dark:text-indigo-200">
                          {selectedPlaybook.decision}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Recommendation */}
                  <Card className="bg-card dark:bg-slate-900 border-border dark:border-slate-800">
                    <CardHeader className="p-4 pb-2">
                      <div className="text-[10px] text-muted-foreground font-bold tracking-widest uppercase">STEP 3</div>
                      <CardTitle className="text-sm text-foreground">Recommendation</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 text-sm text-foreground leading-relaxed">
                      {selectedPlaybook.recommendation}
                    </CardContent>
                  </Card>

                  {/* Optional starred fields */}
                  {(selectedPlaybook.descriptionTemplate || selectedPlaybook.evidenceToCollect) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border dark:border-slate-800">
                      {selectedPlaybook.descriptionTemplate && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs dark:bg-amber-950/20 dark:border-amber-900/40">
                          <div className="flex items-center gap-1.5 text-amber-700 font-semibold mb-2 dark:text-amber-400">
                            <Info className="h-4 w-4" />
                            <span>Description Template ⭐</span>
                          </div>
                          <p className="text-amber-800 leading-relaxed whitespace-pre-line dark:text-amber-200/80">
                            {selectedPlaybook.descriptionTemplate}
                          </p>
                        </div>
                      )}
                      {selectedPlaybook.evidenceToCollect && (
                        <div className="bg-background dark:bg-slate-950 border border-border dark:border-slate-800 rounded-lg p-4 text-xs">
                          <div className="flex items-center gap-1.5 text-blue-700 font-semibold mb-2 dark:text-blue-400">
                            <FileText className="h-4 w-4" />
                            <span>Evidence to Collect ⭐</span>
                          </div>
                          <p className="text-foreground leading-relaxed whitespace-pre-line">
                            {selectedPlaybook.evidenceToCollect}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>

                {/* ── Detection Logic Tab ── */}
                <TabsContent value="detection" className="mt-4">
                  <Card className="bg-card dark:bg-slate-900 border-border dark:border-slate-800">
                    <CardHeader className="p-4 border-b border-border/80 dark:border-slate-800/80">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base text-foreground flex items-center gap-2">
                          <Terminal className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />Detection Query / Logic
                        </CardTitle>
                        <Button
                          onClick={() => handleCopy(selectedPlaybook.detectionLogic)}
                          variant="secondary" size="sm"
                          className="bg-muted hover:bg-muted dark:hover:bg-slate-800 text-xs gap-1.5"
                        >
                          {copied ? <><Check className="h-3.5 w-3.5 text-emerald-400" />Copied</> : <><Copy className="h-3.5 w-3.5" />Copy</>}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <pre className="p-4 bg-muted text-emerald-700 font-mono text-sm overflow-x-auto rounded-b-lg dark:bg-background dark:text-emerald-400">
                        <code>{selectedPlaybook.detectionLogic}</code>
                      </pre>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── MITRE Intel Tab ── */}
                <TabsContent value="intel" className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Techniques */}
                    <Card className="bg-card dark:bg-slate-900 border-border dark:border-slate-800">
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm text-foreground">Techniques (optional)</CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">ATT&CK Technique IDs</CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        {selectedPlaybook.mitreTechniqueIds.length === 0 ? (
                          <span className="text-muted-foreground text-xs">Not specified</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {selectedPlaybook.mitreTechniqueIds.map((id, i) => (
                              <a key={id} href={`https://attack.mitre.org/techniques/${id}/`} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1 bg-background dark:bg-slate-950 border border-border dark:border-slate-800 hover:border-indigo-600 text-indigo-700 dark:text-indigo-300 text-xs px-2 py-1 rounded transition"
                              >
                                <span className="font-mono">{id}</span>
                                <span className="text-muted-foreground">–</span>
                                <span>{selectedPlaybook.mitreTechniqueNames[i]}</span>
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                              </a>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Tactics */}
                    <Card className="bg-card dark:bg-slate-900 border-border dark:border-slate-800">
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm text-foreground">Tactics (optional)</CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">ATT&CK Tactic IDs</CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        {selectedPlaybook.mitreTacticIds.length === 0 ? (
                          <span className="text-muted-foreground text-xs">Not specified</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {selectedPlaybook.mitreTacticIds.map((id, i) => (
                              <span key={id} className="flex items-center gap-1 bg-purple-100 border border-purple-300 text-purple-800 text-xs px-2 py-1 rounded dark:bg-purple-950/30 dark:border-purple-800/50 dark:text-purple-300">
                                <span className="font-mono">{id}</span>
                                <span className="text-muted-foreground">–</span>
                                <span>{selectedPlaybook.mitreTacticNames[i]}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>

      {/* ─── Create / Edit Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-card dark:bg-slate-900 border-border dark:border-slate-800 text-foreground max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {dialogMode === "create" ? "Add New Playbook" : `Edit Playbook – ${formData.playbookId}`}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Fields marked <span className="text-rose-500">*</span> are mandatory. Fields with ⭐ are optional.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave}>
            <ScrollArea className="h-[62vh] pr-4">
              <div className="space-y-5 pb-4">
                {/* ── Row 1: Playbook ID (read-only auto) + Rule ID ── */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-foreground font-semibold">Playbook ID</Label>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/60 bg-muted/60">
                      <span className="font-mono text-indigo-400 font-bold text-sm tracking-wider">{formData.playbookId}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">auto-generated</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-foreground font-semibold">Rule ID <span className="text-muted-foreground font-normal">⭐</span></Label>
                    <Input value={formData.ruleId}
                      onChange={e => setFormData(p => ({ ...p, ruleId: e.target.value }))}
                      placeholder="e.g. RULE-RANSOMWARE-001 (optional)"
                      className="bg-background border-border text-foreground text-sm" />
                  </div>
                </div>

                {/* ── Row 2: Use Case & Tenant ── */}
                <div className="space-y-1">
                  <Label className="text-xs text-foreground font-semibold">Use Case Name <span className="text-rose-500">*</span></Label>
                  <Input value={formData.useCaseName}
                    onChange={e => setFormData(p => ({ ...p, useCaseName: e.target.value }))}
                    placeholder="e.g. Host Intrusion Detection"
                    className="bg-background border-border text-foreground text-sm" required />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-foreground font-semibold">
                    Tenant <span className="text-rose-500">*</span>
                    <span className="text-muted-foreground font-normal ml-2">(select existing or add new)</span>
                  </Label>
                  <TenantSelect
                    value={formData.tenants}
                    onChange={v => setFormData(p => ({ ...p, tenants: v }))}
                    existingTenants={allTenants}
                  />
                </div>

                {/* ── Row 3: Status & Severity ── */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-foreground font-semibold">Status <span className="text-rose-500">*</span></Label>
                    <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}>
                      <SelectTrigger className="bg-background border-border text-foreground text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border-border text-foreground">
                        <SelectItem value="enable">Enable</SelectItem>
                        <SelectItem value="disable">Disable</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-foreground font-semibold">Severity <span className="text-rose-500">*</span></Label>
                    <Select value={formData.severity} onValueChange={v => setFormData(p => ({ ...p, severity: v }))}>
                      <SelectTrigger className="bg-background border-border text-foreground text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border-border text-foreground">
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Critical">Critical</SelectItem>
                        <SelectItem value="Low - Medium">Low - Medium</SelectItem>
                        <SelectItem value="Low - High">Low - High</SelectItem>
                        <SelectItem value="Low - Critical">Low - Critical</SelectItem>
                        <SelectItem value="Medium - High">Medium - High</SelectItem>
                        <SelectItem value="Medium - Critical">Medium - Critical</SelectItem>
                        <SelectItem value="High - Critical">High - Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* ── Description ── */}
                <div className="space-y-1">
                  <Label className="text-xs text-foreground font-semibold">Description <span className="text-rose-500">*</span></Label>
                  <Textarea value={formData.description}
                    onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                    placeholder="Describe the threat scenario..."
                    rows={2} className="bg-background border-border text-foreground text-sm resize-none" required />
                </div>

                {/* ── Detection Type / Log Source / Event ID ── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-foreground font-semibold">Detection Type <span className="text-rose-500">*</span></Label>
                    <Select value={formData.detectionType} onValueChange={v => setFormData(p => ({ ...p, detectionType: v }))}>
                      <SelectTrigger className="bg-background border-border text-foreground text-sm">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent className="bg-background border-border text-foreground">
                        <SelectItem value="Machine Learning">Machine Learning</SelectItem>
                        <SelectItem value="Static Usecase">Static Usecase</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-foreground font-semibold">Log Source <span className="text-rose-500">*</span></Label>
                    <Input value={formData.logSource}
                      onChange={e => setFormData(p => ({ ...p, logSource: e.target.value }))}
                      placeholder="e.g. Sysmon, Azure AD"
                      className="bg-background border-border text-foreground text-sm" required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-foreground font-semibold">Event ID / Type <span className="text-rose-500">*</span></Label>
                    <Input value={formData.eventIdType}
                      onChange={e => setFormData(p => ({ ...p, eventIdType: e.target.value }))}
                      placeholder="e.g. Event ID 4625"
                      className="bg-background border-border text-foreground text-sm" required />
                  </div>
                </div>

                {/* ── MITRE (Optional) ── */}
                <div className="space-y-3 bg-background/40 border border-border/60 rounded-lg p-3">
                  <div className="text-xs font-bold text-purple-400 uppercase tracking-widest">MITRE ATT&CK (Optional ⭐)</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground font-semibold">Technique ID & Name</Label>
                      <MitreTechniqueSelect
                        value={formData.selectedTechniques}
                        onChange={v => setFormData(p => ({ ...p, selectedTechniques: v }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground font-semibold">Tactic ID & Name</Label>
                      <MitreTacticSelect
                        value={formData.selectedTactics}
                        onChange={v => setFormData(p => ({ ...p, selectedTactics: v }))}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Detection Logic ── */}
                <div className="space-y-1">
                  <Label className="text-xs text-foreground font-semibold">Detection Logic <span className="text-rose-500">*</span></Label>
                  <Textarea value={formData.detectionLogic}
                    onChange={e => setFormData(p => ({ ...p, detectionLogic: e.target.value }))}
                    placeholder="SIEM query or detection rules..."
                    rows={4} className="bg-background border-border font-mono text-emerald-400 text-xs resize-none" required />
                </div>

                {/* ── How to Check ── */}
                <div className="space-y-1">
                  <Label className="text-xs text-foreground font-semibold">How to Check <span className="text-rose-500">*</span></Label>
                  <Textarea value={formData.howToCheck}
                    onChange={e => setFormData(p => ({ ...p, howToCheck: e.target.value }))}
                    placeholder="Step-by-step verification instructions..."
                    rows={3} className="bg-background border-border text-foreground text-sm resize-none" required />
                </div>

                {/* ── Decision ── */}
                <div className="space-y-1">
                  <Label className="text-xs text-foreground font-semibold">Decision <span className="text-rose-500">*</span></Label>
                  <Textarea value={formData.decision}
                    onChange={e => setFormData(p => ({ ...p, decision: e.target.value }))}
                    placeholder="Decision tree / criteria..."
                    rows={3} className="bg-background border-border text-foreground text-sm resize-none" required />
                </div>

                {/* ── Recommendation ── */}
                <div className="space-y-1">
                  <Label className="text-xs text-foreground font-semibold">Recommendation <span className="text-rose-500">*</span></Label>
                  <Textarea value={formData.recommendation}
                    onChange={e => setFormData(p => ({ ...p, recommendation: e.target.value }))}
                    placeholder="Long-term remediation and prevention..."
                    rows={3} className="bg-background border-border text-foreground text-sm resize-none" required />
                </div>

                {/* ── Optional starred ── */}
                <div className="space-y-3 bg-amber-950/10 border border-amber-900/30 rounded-lg p-3">
                  <div className="text-xs font-bold text-yellow-500 uppercase tracking-widest">Optional Fields ⭐</div>
                  <div className="space-y-1">
                    <Label className="text-xs text-foreground font-semibold">Description Template</Label>
                    <Textarea value={formData.descriptionTemplate}
                      onChange={e => setFormData(p => ({ ...p, descriptionTemplate: e.target.value }))}
                      placeholder="Ticket / report description template..."
                      rows={2} className="bg-background border-border text-foreground text-sm resize-none" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-foreground font-semibold">Evidence to Collect</Label>
                    <Textarea value={formData.evidenceToCollect}
                      onChange={e => setFormData(p => ({ ...p, evidenceToCollect: e.target.value }))}
                      placeholder="Evidence checklist for documentation..."
                      rows={2} className="bg-background border-border text-foreground text-sm resize-none" />
                  </div>
                </div>
              </div>
            </ScrollArea>

            {formError && (
              <div className="mt-2 text-xs text-rose-400 bg-rose-950/30 border border-rose-800/50 rounded px-3 py-2">
                {formError}
              </div>
            )}

            <DialogFooter className="border-t border-border pt-4 mt-4 flex gap-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="border-border text-foreground">
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 text-white min-w-[120px]">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Playbook"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
