import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Vault, Users, BookKey, Settings, LogOut, ShieldAlert,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

const NAV_ITEMS = [
  { to: '/dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
  { to: '/vault',     icon: <Vault           size={18} />, label: 'Vault'     },
  { to: '/teams',     icon: <Users           size={18} />, label: 'Teams',    roles: ['admin', 'tl'] },
  { to: '/audit',     icon: <BookKey         size={18} />, label: 'Audit Log', roles: ['admin', 'tl'] },
  { to: '/admin',     icon: <ShieldAlert     size={18} />, label: 'Admin',    roles: ['admin'] },
  { to: '/settings',  icon: <Settings        size={18} />, label: 'Settings'  },
] as const

export function Sidebar() {
  const user     = useAuthStore((s) => s.user)
  const logout   = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const visibleItems = NAV_ITEMS.filter(
    (item) => !('roles' in item) || (user && (item.roles as readonly string[]).includes(user.role)),
  )

  return (
    <aside className="flex flex-col w-56 shrink-0 h-full glass rounded-none border-r border-[var(--color-border)] border-t-0 border-b-0 border-l-0">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-primary)] drop-shadow-[0_0_8px_var(--color-primary)]">
            <Vault size={22} />
          </span>
          <span className="font-semibold text-base tracking-tight text-[var(--color-text)]">
            SecureVault
          </span>
        </div>
        {user && (
          <p className="mt-1 text-[11px] text-[var(--color-text-dim)] font-mono truncate">
            {user.username}
          </p>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150',
                isActive
                  ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]',
              )
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-[var(--color-border)]">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-[var(--color-text-dim)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-all duration-150"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </aside>
  )
}
