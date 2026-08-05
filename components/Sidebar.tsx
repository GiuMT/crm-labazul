'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

const NAV = [
  { href: '/pipeline', label: 'Pipeline', icon: '▦' },
  { href: '/contatos', label: 'Contatos', icon: '☰' },
  { href: '/analytics', label: 'Analytics', icon: '▤' },
]

export default function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname()

  return (
    <aside className="flex w-60 flex-col bg-marca-azul text-white">
      <div className="flex items-center gap-2 px-6 py-5">
        <span className="inline-block h-3 w-3 rounded-full bg-marca-ciano" />
        <span className="text-lg font-bold">LabAzul</span>
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? 'bg-marca-primario text-white'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="w-4 text-center">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/10 px-6 py-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-marca-ciano text-sm font-bold text-marca-azul">
            {userName.charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-sm">{userName}</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-xs text-white/60 hover:text-white"
        >
          Sair
        </button>
      </div>
    </aside>
  )
}
