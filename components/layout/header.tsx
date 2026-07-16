import { NotificationsBell } from '@/components/notifications-bell'

interface HeaderProps {
  title: string
  actions?: React.ReactNode
}

export function Header({ title, actions }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-gray-200 bg-white px-4 sm:px-6">
      <h1 className="flex-1 truncate text-base font-semibold text-gray-900">{title}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
      <NotificationsBell />
    </header>
  )
}
