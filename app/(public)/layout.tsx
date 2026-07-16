import Link from 'next/link'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7faf9] text-[#102a43]">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-xl font-bold">Atende<span className="text-[#18a999]">PRO</span></Link>
          <div className="flex items-center gap-4 text-sm font-semibold"><Link href="/login">Entrar</Link><Link href="/register" className="rounded-lg bg-[#102a43] px-4 py-2 text-white">Criar conta</Link></div>
        </div>
      </nav>
      <main className="mx-auto max-w-4xl px-5 py-12">{children}</main>
      <footer className="mx-auto flex max-w-5xl justify-between border-t border-slate-200 px-5 py-7 text-sm text-slate-500">
        <span>© 2026 AtendePRO</span>
        <div className="flex gap-4"><Link href="/terms">Termos</Link><Link href="/privacy">Privacidade</Link></div>
      </footer>
    </div>
  )
}
