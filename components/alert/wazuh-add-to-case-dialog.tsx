"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

interface WazuhAddToCaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alertIds: string[]
  onCaseCreated?: () => void
}

export function WazuhAddToCaseDialog({ 
  open, 
  onOpenChange, 
  alertIds, 
  onCaseCreated 
}: WazuhAddToCaseDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<any[]>([])
  const [caseName, setCaseName] = useState("")
  const [assigneeId, setAssigneeId] = useState("")
  const [description, setDescription] = useState("")
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    // Fetch current user and users for assignee selection
    const fetchData = async () => {
      try {
        // Try to get the currently authenticated user
        const meResp = await fetch('/api/auth/me')
        if (meResp.ok) {
          const meData = await meResp.json()
          if (meData?.user) {
            setCurrentUser({ id: meData.user.id, name: meData.user.name || meData.user.email })
          }
        }

        // Fetch users list for assignee dropdown
        const response = await fetch('/api/users')
        if (response.ok) {
          const data = await response.json()
          const usersList = data.users || data || []
          setUsers(usersList)
        }
      } catch (error) {
        console.error('Failed to fetch users or current user:', error)
      }
    }

    if (open) {
      fetchData()
    }
  }, [open])

  const handleCreateCase = async () => {
    if (!caseName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a case name",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    try {
      console.log("Submitting case with:", {
        alertIds,
        caseName,
        assigneeId: assigneeId || null,
        description,
        createdById: currentUser?.id,
        createdBy: currentUser?.name,
      })

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch("/api/wazuh/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertIds,
          caseName,
          assigneeId: assigneeId || null,
          description,
          createdById: currentUser?.id,
          createdBy: currentUser?.name,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId);

      console.log("Response status:", response.status)
      const data = await response.json()
      console.log("Response data:", data)

      if (!response.ok) {
        throw new Error(data.error || "Failed to create case")
      }
      
      toast({
        title: "Success",
        description: `Case created with ${alertIds.length} alert(s)`,
      })

      onOpenChange(false)
      onCaseCreated?.()

      // Reset form
      setCaseName("")
      setAssigneeId("")
      setDescription("")
    } catch (error: any) {
      console.error("Error creating case:", error)
      toast({
        title: "Error",
        description: error.name === "AbortError" ? "Request timeout" : (error.message || "Failed to create case"),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Wazuh Case</DialogTitle>
          <DialogDescription>
            Create a new case and add {alertIds.length} alert(s) to it
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="caseName">Case Name *</Label>
            <Input
              id="caseName"
              placeholder="Enter case name"
              value={caseName}
              onChange={(e) => setCaseName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assignee">Assign to</Label>
            <Select value={assigneeId || "unassigned"} onValueChange={(value) => setAssigneeId(value === "unassigned" ? "" : value)}>
              <SelectTrigger id="assignee">
                <SelectValue placeholder="Select assignee (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Add notes or description for this case..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none"
              rows={3}
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateCase} disabled={loading || !caseName.trim()}>
            {loading ? "Creating..." : "Create Case"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
