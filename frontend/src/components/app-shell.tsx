"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { Bell, Command, Menu, Plus } from "lucide-react"
import { DashboardNav } from "@/components/dashboard-nav"
import { DashboardHeader } from "@/components/dashboard-header"
import { GlobalSearch } from "@/components/global-search"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { UserPreferencesHydrator } from "@/components/user-preferences-hydrator"

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  return (
    <div className="min-h-screen bg-background text-foreground">
      <UserPreferencesHydrator />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-white/10 bg-[#0e0f12] text-white lg:flex">
        <Link href="/dashboard" className="flex h-[76px] items-center gap-3 border-b border-white/10 px-6">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white">
            <Command className="h-5 w-5" strokeWidth={2.4} />
          </span>
          <span>
            <span className="block text-[15px] font-semibold tracking-tight">Lexi</span>
          </span>
        </Link>

        <div className="px-4 py-5">
          <Link
            href="/municipal?new=1"
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Novo processo
          </Link>
        </div>

        <DashboardNav />

        <div className="mt-auto" />
      </aside>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center gap-2 border-b border-border bg-card/95 px-3 backdrop-blur-xl sm:px-5 lg:h-[76px] lg:px-8">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild><button aria-label="Abrir navegação" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"><Menu className="h-5 w-5" /></button></SheetTrigger>
            <SheetContent side="left" className="w-[286px] border-0 bg-[#0e0f12] p-0 text-white">
              <SheetHeader className="border-b border-white/10 px-5 py-5 text-left"><SheetTitle className="flex items-center gap-3 text-white"><span className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white"><Command className="h-5 w-5" /></span>Lexi</SheetTitle><SheetDescription className="text-white/45">Coleta e validação de regras</SheetDescription></SheetHeader>
              <div className="px-4 pt-4"><Link href="/municipal?new=1" onClick={() => setMobileMenuOpen(false)} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" />Novo processo</Link></div>
              <div className="pt-5"><DashboardNav onNavigate={() => setMobileMenuOpen(false)} /></div>
            </SheetContent>
          </Sheet>
          <GlobalSearch />
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <button aria-label="Notificações" className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground">
              <Bell className="h-[18px] w-[18px]" />
            </button>
            <DashboardHeader />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-3 py-5 sm:px-5 md:px-8 md:py-9">{children}</main>
      </div>
    </div>
  )
}
