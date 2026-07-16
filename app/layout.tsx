import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import './globals.css'

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: 'AtendePRO — Agenda para beleza e bem-estar',
    template: '%s | AtendePRO',
  },
  description:
    'Agenda online, clientes, serviços, pacotes, caixa e lembretes para profissionais de beleza e bem-estar.',
  keywords: [
    'agenda para cabeleireira',
    'agenda para designer de sobrancelhas',
    'agenda para massoterapeuta',
    'agendamento online',
    'gestão de clientes',
  ],
  manifest: '/site.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'AtendePRO' },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'AtendePRO — Agenda para beleza e bem-estar',
    description: 'Organize horários, clientes, serviços, vendas e retornos em um só lugar.',
    images: ['/og-image.png'],
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', images: ['/og-image.png'] },
}

export const viewport: Viewport = {
  themeColor: '#18a999',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
