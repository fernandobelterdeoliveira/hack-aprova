"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"

export function UserPreferencesHydrator() {
  const { setTheme } = useTheme()
  useEffect(() => {
    fetch("/api/profile", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => {
        if (!body?.profile) return
        setTheme(body.profile.theme || "light")
        document.documentElement.dataset.accent = body.profile.accentColor || "cobalt"
        document.documentElement.dataset.density = body.profile.density || "comfortable"
        document.documentElement.lang = body.profile.language || "pt-BR"
        localStorage.setItem("lexiloop-accent", body.profile.accentColor || "cobalt")
        localStorage.setItem("lexiloop-density", body.profile.density || "comfortable")
      })
      .catch(() => undefined)
  }, [setTheme])
  return null
}
