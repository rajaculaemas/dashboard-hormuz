import Link from "next/link"
import { Shield } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <div className="text-primary mb-6">
        <Shield className="h-16 w-16" />
      </div>
      <h1 className="text-4xl font-bold mb-4">404 - Halaman Tidak Ditemukan</h1>
      <p className="text-lg text-muted-foreground mb-6 text-center max-w-md">
        Maaf, halaman yang Anda cari tidak dapat ditemukan atau mungkin telah dipindahkan.
      </p>
      <div className="flex gap-4">
        <Button asChild>
          <Link href="/">Kembali ke Beranda</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
