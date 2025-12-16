import { Shield } from "lucide-react"

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <div className="animate-pulse flex flex-col items-center">
        <Shield className="h-16 w-16 text-primary mb-4" />
        <h2 className="text-2xl font-bold">Memuat...</h2>
        <p className="text-muted-foreground mt-2">Mohon tunggu sebentar</p>
      </div>
    </div>
  )
}
