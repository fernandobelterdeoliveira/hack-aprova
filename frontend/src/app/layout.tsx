import type React from "react"
import type { Metadata } from "next"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import "./globals.css"

export const metadata: Metadata = {
    title: "LexiLoop | Regras e implantação",
    description: "Coleta de evidências, comunicação e validação de regras de processos",
}

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html lang="pt-BR" suppressHydrationWarning>
        <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var a=localStorage.getItem('lexiloop-accent');var d=localStorage.getItem('lexiloop-density');if(a)document.documentElement.dataset.accent=a;if(d)document.documentElement.dataset.density=d}catch(e){}` }} />
        </head>
        <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
            {children}
            <Toaster />
        </ThemeProvider>
        </body>
        </html>
    )
}
