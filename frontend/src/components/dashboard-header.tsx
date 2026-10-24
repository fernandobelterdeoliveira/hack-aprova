"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import Link from "next/link"
import Image from "next/image"

export function DashboardHeader() {
  const [profile, setProfile] = useState({ name: "Alex Reyes", role: "Assistente jurídico", avatarUrl: null as string | null })
  const [avatarFailed, setAvatarFailed] = useState(false)

  useEffect(() => {
    const load = () => fetch("/api/profile", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => { if (body?.profile) { setProfile(body.profile); setAvatarFailed(false) } })
      .catch(() => undefined)
    load()
    window.addEventListener("profile-updated", load)
    return () => window.removeEventListener("profile-updated", load)
  }, [])

  const initials = profile.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()

  return (
    <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-11 gap-3 rounded-xl px-2.5 hover:bg-muted">
              {profile.avatarUrl && !avatarFailed ? <Image
                key={profile.avatarUrl}
                src={profile.avatarUrl}
                width={32}
                height={32}
                unoptimized
                onError={() => setAvatarFailed(true)}
                className="h-8 w-8 rounded-lg object-cover object-center"
                alt={`Foto de ${profile.name}`}
              /> : <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-[11px] font-semibold text-primary-foreground">{initials}</span>}
              <span className="hidden text-left sm:block">
                <span className="block text-xs font-semibold leading-4 text-slate-800">{profile.name}</span>
                <span className="block text-[10px] leading-3 text-slate-400">{profile.role}</span>
              </span>
              <span className="sr-only">Menu do usuário</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{profile.name}</DropdownMenuLabel>
            <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">{profile.role}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/profile" className="w-full">Perfil</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/settings" className="w-full">Configurações</Link></DropdownMenuItem>
            <DropdownMenuSeparator />

          
              <DropdownMenuItem asChild><Link href="/" className="w-full">Sair</Link></DropdownMenuItem>
         

          </DropdownMenuContent>
    </DropdownMenu>
  )
}
