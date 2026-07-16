import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('brand')
  return (
    <div className="min-h-screen bg-[#f7faf9] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-2xl font-bold no-underline text-[#102a43]">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#18a999] text-white"><CalendarDays className="h-5 w-5" /></span>
            Atende<span className="text-[#18a999]">PRO</span>
          </Link>
          <p className="text-sm text-gray-500 mt-2">{t('tagline')}</p>
        </div>
        {children}
      </div>
    </div>
  )
}
