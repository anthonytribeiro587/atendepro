import { Bell } from 'lucide-react'

interface HeaderProps {
  title: string
  actions?: React.ReactNode
}

export function Header({ title, actions }: HeaderProps) {
  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center px-6 gap-4 sticky top-0 z-10">
      <h1 className="text-base font-semibold text-gray-900 flex-1">{title}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
      <button className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
        <Bell className="w-4 h-4" />
      </button>
    </header>
  )
}
