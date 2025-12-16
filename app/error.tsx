"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error ke layanan analitik
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <div className="text-red-500 mb-6">
        <AlertCircle className="h-16 w-16" />
      </div>
      <h1 className="text-4xl font-bold mb-4">Terjadi Kesalahan</h1>
      <p className="text-lg text-muted-foreground mb-6 text-center max-w-md">
        Maaf, terjadi kesalahan saat memuat halaman ini. Tim kami telah diberitahu tentang masalah ini.
      </p>
      <div className="flex gap-4">
        <Button onClick={reset}>Coba Lagi</Button>
        <Button variant="outline" asChild>
          <Link href="/">Kembali ke Beranda</Link>
        </Button>
      </div>
    </div>
  )
}
