"use client"

import { Label } from "@/components/ui/label"

import type React from "react"

import { useState } from "react"
import { motion } from "framer-motion"
import { Save, Plus, Trash2, MoveHorizontal, ArrowRight, Download, Upload, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface PlaybookStep {
  id: string
  type: "action" | "decision" | "integration"
  title: string
  description: string
  position: { x: number; y: number }
  connections: string[]
}

export default function PlaybookEditorPage() {
  const [playbook, setPlaybook] = useState<{
    id: string
    name: string
    description: string
    steps: PlaybookStep[]
  }>({
    id: "1",
    name: "Ransomware Response Playbook",
    description: "Standard operating procedure for responding to ransomware incidents",
    steps: [
      {
        id: "step1",
        type: "action",
        title: "Isolate Affected Systems",
        description: "Disconnect affected systems from the network to prevent lateral movement",
        position: { x: 100, y: 100 },
        connections: ["step2"],
      },
      {
        id: "step2",
        type: "decision",
        title: "Assess Encryption Scope",
        description: "Determine which systems and data have been encrypted",
        position: { x: 300, y: 100 },
        connections: ["step3", "step4"],
      },
      {
        id: "step3",
        type: "action",
        title: "Activate Backup Recovery",
        description: "Restore systems from the most recent clean backups",
        position: { x: 500, y: 50 },
        connections: ["step5"],
      },
      {
        id: "step4",
        type: "integration",
        title: "Engage Incident Response Team",
        description: "Notify external IR team and coordinate response efforts",
        position: { x: 500, y: 150 },
        connections: ["step5"],
      },
      {
        id: "step5",
        type: "action",
        title: "Document and Report",
        description: "Document the incident and report to relevant authorities",
        position: { x: 700, y: 100 },
        connections: [],
      },
    ],
  })

  const [selectedStep, setSelectedStep] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const handleStepDragStart = (e: React.MouseEvent, stepId: string) => {
    const step = playbook.steps.find((s) => s.id === stepId)
    if (!step) return

    setSelectedStep(stepId)
    setIsDragging(true)

    const rect = e.currentTarget.getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  const handleStepDragMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedStep) return

    const canvasRect = document.getElementById("playbook-canvas")?.getBoundingClientRect()
    if (!canvasRect) return

    const newX = e.clientX - canvasRect.left - dragOffset.x
    const newY = e.clientY - canvasRect.top - dragOffset.y

    setPlaybook((prev) => ({
      ...prev,
      steps: prev.steps.map((step) => (step.id === selectedStep ? { ...step, position: { x: newX, y: newY } } : step)),
    }))
  }

  const handleStepDragEnd = () => {
    setIsDragging(false)
  }

  const addNewStep = () => {
    const newStep: PlaybookStep = {
      id: `step${playbook.steps.length + 1}`,
      type: "action",
      title: "New Step",
      description: "Description for the new step",
      position: { x: 100, y: 300 },
      connections: [],
    }

    setPlaybook((prev) => ({
      ...prev,
      steps: [...prev.steps, newStep],
    }))

    setSelectedStep(newStep.id)
  }

  const deleteStep = (stepId: string) => {
    setPlaybook((prev) => ({
      ...prev,
      steps: prev.steps
        .filter((step) => step.id !== stepId)
        .map((step) => ({
          ...step,
          connections: step.connections.filter((id) => id !== stepId),
        })),
    }))

    if (selectedStep === stepId) {
      setSelectedStep(null)
    }
  }

  const updateStepProperty = (stepId: string, property: keyof PlaybookStep, value: any) => {
    setPlaybook((prev) => ({
      ...prev,
      steps: prev.steps.map((step) => (step.id === stepId ? { ...step, [property]: value } : step)),
    }))
  }

  const toggleConnection = (fromId: string, toId: string) => {
    setPlaybook((prev) => ({
      ...prev,
      steps: prev.steps.map((step) => {
        if (step.id === fromId) {
          const hasConnection = step.connections.includes(toId)
          return {
            ...step,
            connections: hasConnection ? step.connections.filter((id) => id !== toId) : [...step.connections, toId],
          }
        }
        return step
      }),
    }))
  }

  const getStepTypeColor = (type: string) => {
    switch (type) {
      case "action":
        return "bg-blue-500"
      case "decision":
        return "bg-yellow-500"
      case "integration":
        return "bg-purple-500"
      default:
        return "bg-gray-500"
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SOARGPT Playbook Editor</h1>
          <p className="text-muted-foreground">Create and edit automated security response playbooks</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button size="sm">
            <Save className="h-4 w-4 mr-2" />
            Save Playbook
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle>Playbook Canvas</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={addNewStep}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Step
                  </Button>
                  <Button variant="outline" size="sm">
                    <Play className="h-4 w-4 mr-2" />
                    Test Run
                  </Button>
                </div>
              </div>
              <CardDescription>Drag and drop steps to create your playbook workflow</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                id="playbook-canvas"
                className="relative bg-muted/50 border rounded-lg h-[600px] overflow-auto"
                onMouseMove={handleStepDragMove}
                onMouseUp={handleStepDragEnd}
                onMouseLeave={handleStepDragEnd}
              >
                {/* Connection lines */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  {playbook.steps.flatMap((step) =>
                    step.connections.map((targetId) => {
                      const target = playbook.steps.find((s) => s.id === targetId)
                      if (!target) return null

                      const startX = step.position.x + 100
                      const startY = step.position.y + 40
                      const endX = target.position.x
                      const endY = target.position.y + 40

                      return (
                        <g key={`${step.id}-${targetId}`}>
                          <path
                            d={`M${startX},${startY} C${startX + 50},${startY} ${endX - 50},${endY} ${endX},${endY}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeDasharray={step.type === "decision" ? "5,5" : ""}
                            className="text-muted-foreground"
                          />
                          <polygon
                            points={`${endX},${endY} ${endX - 10},${endY - 5} ${endX - 10},${endY + 5}`}
                            fill="currentColor"
                            className="text-muted-foreground"
                          />
                        </g>
                      )
                    }),
                  )}
                </svg>

                {/* Playbook steps */}
                {playbook.steps.map((step) => (
                  <motion.div
                    key={step.id}
                    className={`absolute w-[200px] rounded-lg border bg-card text-card-foreground shadow-sm cursor-move ${
                      selectedStep === step.id ? "ring-2 ring-primary" : ""
                    }`}
                    style={{
                      left: `${step.position.x}px`,
                      top: `${step.position.y}px`,
                    }}
                    onClick={() => setSelectedStep(step.id)}
                    onMouseDown={(e) => handleStepDragStart(e, step.id)}
                    whileHover={{ scale: 1.02 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <Badge className={`${getStepTypeColor(step.type)} text-white`}>{step.type}</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteStep(step.id)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <h3 className="font-medium text-sm truncate">{step.title}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{step.description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-6">
            <CardHeader className="pb-2">
              <CardTitle>Playbook Properties</CardTitle>
              <CardDescription>Configure your playbook and selected step</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="playbook">
                <TabsList className="w-full mb-4">
                  <TabsTrigger value="playbook">Playbook</TabsTrigger>
                  <TabsTrigger value="step" disabled={!selectedStep}>
                    Step
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="playbook" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="playbook-name">Playbook Name</Label>
                    <Input
                      id="playbook-name"
                      value={playbook.name}
                      onChange={(e) => setPlaybook((prev) => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="playbook-description">Description</Label>
                    <Textarea
                      id="playbook-description"
                      value={playbook.description}
                      onChange={(e) => setPlaybook((prev) => ({ ...prev, description: e.target.value }))}
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Playbook Statistics</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="border rounded p-2">
                        <div className="text-sm text-muted-foreground">Steps</div>
                        <div className="text-xl font-bold">{playbook.steps.length}</div>
                      </div>
                      <div className="border rounded p-2">
                        <div className="text-sm text-muted-foreground">Connections</div>
                        <div className="text-xl font-bold">
                          {playbook.steps.reduce((acc, step) => acc + step.connections.length, 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="step" className="space-y-4">
                  {selectedStep && (
                    <>
                      {(() => {
                        const step = playbook.steps.find((s) => s.id === selectedStep)
                        if (!step) return null

                        return (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="step-title">Step Title</Label>
                              <Input
                                id="step-title"
                                value={step.title}
                                onChange={(e) => updateStepProperty(step.id, "title", e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="step-type">Step Type</Label>
                              <Select
                                value={step.type}
                                onValueChange={(value) => updateStepProperty(step.id, "type", value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="action">Action</SelectItem>
                                  <SelectItem value="decision">Decision</SelectItem>
                                  <SelectItem value="integration">Integration</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="step-description">Description</Label>
                              <Textarea
                                id="step-description"
                                value={step.description}
                                onChange={(e) => updateStepProperty(step.id, "description", e.target.value)}
                                rows={4}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Connections</Label>
                              <div className="border rounded-lg p-2 max-h-[200px] overflow-y-auto">
                                {playbook.steps.filter((s) => s.id !== step.id).length === 0 ? (
                                  <div className="text-sm text-muted-foreground text-center py-2">
                                    No other steps to connect to
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {playbook.steps
                                      .filter((s) => s.id !== step.id)
                                      .map((targetStep) => (
                                        <div
                                          key={targetStep.id}
                                          className="flex items-center justify-between p-2 border rounded hover:bg-accent"
                                        >
                                          <div className="flex items-center gap-2">
                                            <Badge className={`${getStepTypeColor(targetStep.type)} text-white`}>
                                              {targetStep.type}
                                            </Badge>
                                            <span className="text-sm">{targetStep.title}</span>
                                          </div>
                                          <Button
                                            variant={step.connections.includes(targetStep.id) ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => toggleConnection(step.id, targetStep.id)}
                                          >
                                            {step.connections.includes(targetStep.id) ? (
                                              <>
                                                <MoveHorizontal className="h-4 w-4 mr-1" />
                                                Connected
                                              </>
                                            ) : (
                                              <>
                                                <ArrowRight className="h-4 w-4 mr-1" />
                                                Connect
                                              </>
                                            )}
                                          </Button>
                                        </div>
                                      ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        )
                      })()}
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
            <CardFooter className="border-t pt-4">
              <Button className="w-full">
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
