"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Send, Bot, User, Loader2, Database, Trash } from "lucide-react"
import { cn } from "@/lib/utils"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  isLoading?: boolean
}

export default function ChatPage() {
  // State dan ref yang sudah ada
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const initialized = useRef(false)

  // 1. Load messages dari localStorage saat komponen mount
  useEffect(() => {
    if (typeof window === "undefined" || initialized.current) return
    
    try {
      const saved = localStorage.getItem("soc_assistant_chat")
      if (saved) {
        const parsed = JSON.parse(saved)
        setMessages(parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        })))
      } else {
        // Set default message jika tidak ada history
        setMessages([{
          id: "welcome",
          role: "assistant",
          content: "Hello! Saya SOC Assistant. Saya bisa membantu menganalisis alert, investigasi log dan membantu membuat saran/rekomendasi terkait alert (harapannya). silahkan coba bertanya tentang alert atau security trend yang terjadi di environment anda",
          timestamp: new Date()
        }])
      }
    } catch (error) {
      console.error("Failed to load chat:", error)
      localStorage.removeItem("soc_assistant_chat")
    }

    initialized.current = true
  }, [])

  // 2. Auto-save ke localStorage saat messages berubah
  useEffect(() => {
    if (!initialized.current) return
    try {
      localStorage.setItem("soc_assistant_chat", JSON.stringify(messages))
    } catch (error) {
      console.error("Failed to save chat:", error)
    }
  }, [messages])

  // 3. Fungsi clear chat
  const clearChat = () => {
    setMessages([{
      id: "welcome",
      role: "assistant",
      content: "Hello! Saya SOC Assistant. Saya bisa membantu menganalisis alert, investigasi log dan membantu membuat saran/rekomendasi terkait alert (harapannya). silahkan coba bertanya tentang alert atau security trend yang terjadi di environment anda",
      timestamp: new Date()
    }])
    localStorage.removeItem("soc_assistant_chat")
  }

  // Fungsi-fungsi yang sudah ada (TIDAK DIUBAH)
  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]")
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    }

    const loadingMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isLoading: true,
    }

    setMessages((prev) => [...prev, userMessage, loadingMessage])
    setInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      const assistantMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: data.choices?.[0]?.message?.content || "Sorry, I couldn't process your request.",
        timestamp: new Date(),
      }

      setMessages((prev) => prev.slice(0, -1).concat(assistantMessage))
    } catch (error) {
      console.error("Error:", error)
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: "Sorry, I encountered an error while processing your request. Please try again.",
        timestamp: new Date(),
      }
      setMessages((prev) => prev.slice(0, -1).concat(errorMessage))
    } finally {
      setIsLoading(false)
    }
  }

  const suggestedQuestions = [
    "Tunjukkan Alert 1 Jam terakhir",
    "Apa alert Critical hari ini?",
    "statistik alert dalam kurun waktu 24 jam",
    "cari tau malware yang related dengan alert di database",
    "apakah ada alert yang membutuhkan perhatian lebih dalam 24 jam terakhir?",
    "status keamanan hari ini dong",
  ]

  const handleSuggestedQuestion = (question: string) => {
    setInput(question)
    inputRef.current?.focus()
  }

  // Render UI (hanya tambahkan tombol clear chat)
  return (
<div className="container mx-auto p-6 max-w-4xl">
  <div className="flex flex-col h-[calc(100vh-8rem)]">
    <Card className="flex-1 flex flex-col">
      <CardHeader className="pb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" />
              <CardTitle>SOC Assistant</CardTitle>
            </div>
            <Badge variant="secondary" className="flex items-center gap-1">
              <Database className="h-3 w-3" />
              Connected to Alert Database
            </Badge>
          </div>
          {/* Tombol Clear Chat dengan background hitam */}
          <Button 
            variant="outline"
            size="sm" 
            onClick={clearChat}
            className="bg-red-500 text-white hover:bg-gray-800 hover:text-white dark:bg-gray-900 dark:hover:bg-gray-800"
          >
            <Trash className="h-4 w-4 mr-2" />
            Clear Chat
          </Button>
        </div>
        <CardDescription>
          AI-powered security operations assistant with real-time alert database access
        </CardDescription>
      </CardHeader>

          {/* ... (bagian render messages dan form tetap sama persis) ... */}
          <CardContent className="flex-1 flex flex-col p-0">
            <ScrollArea ref={scrollAreaRef} className="flex-1 px-6">
              <div className="space-y-4 pb-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-3 max-w-[80%]",
                      message.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {message.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div
                      className={cn(
                        "rounded-lg px-4 py-2 text-sm",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {message.isLoading ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Thinking...</span>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      )}
                      <div className="text-xs opacity-70 mt-1">{message.timestamp.toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <Separator />

            {messages.length <= 1 && (
              <div className="p-4 border-b">
                <p className="text-sm text-muted-foreground mb-3">Try asking me about:</p>
                <div className="flex flex-wrap gap-2">
                  {suggestedQuestions.map((question, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      onClick={() => handleSuggestedQuestion(question)}
                      className="text-xs"
                    >
                      {question}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="p-4">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="tanya apa aja.... bahasa inggris juga bisa"
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button type="submit" disabled={isLoading || !input.trim()}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                ?? Saya bisa mengakses database alert / log secara realtime untuk kebutuhan security insight
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}