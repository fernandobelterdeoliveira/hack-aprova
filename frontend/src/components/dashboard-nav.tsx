"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Building2, Inbox, FileText, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/inbox", label: "Ticket", icon: Inbox },
  { href: "/cases", label: "Municípios", icon: Building2 },
  { href: "/communications", label: "Formulários", icon: FileText },
  { href: "/settings", label: "Configurações", icon: Settings },
]

export function DashboardNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1 px-4">
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">Área de trabalho</p>
      {navItems.map((item) => {
        const Icon = item.icon
        // Mark active when the current pathname equals the item href or is a child route
        // e.g. pathname '/cases/123' should keep '/cases' active.
        const isActive = Boolean(
          pathname === item.href || (pathname && pathname.startsWith(item.href + "/"))
        )

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              isActive
                ? "bg-[#202123] text-white shadow-[inset_3px_0_0_var(--brand)]"
                : "text-white/55 hover:bg-white/[0.06] hover:text-white",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
