"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Mail, Loader2 } from "lucide-react"

interface EmailComposeDialogProps {
  caseId: string
  defaultSubject?: string
  onEmailSent?: (updatedCase: unknown) => void
}

export function EmailComposeDialog({ caseId, defaultSubject, onEmailSent }: EmailComposeDialogProps) {
  const [open, setOpen] = useState(false)
  const [emailTo, setEmailTo] = useState("")
  const [emailSubject, setEmailSubject] = useState("")
  const [emailContent, setEmailContent] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openDialog() {
    setEmailTo("")
    setEmailSubject(defaultSubject || "")
    setEmailContent("")
    setError(null)
    setOpen(true)
  }

  async function handleSendEmail() {
    if (!emailTo || !emailSubject || !emailContent) {
      setError('Destinatário, assunto e mensagem são obrigatórios')
      return
    }

    try {
      setSending(true)
      setError(null)
      
      const response = await fetch(`/api/cases/${caseId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailTo,
          subject: emailSubject,
          content: emailContent
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Não foi possível enviar o e-mail')
      }

      const data = await response.json()
      
      // Reset form
      setEmailTo("")
      setEmailSubject("")
      setEmailContent("")
      setOpen(false)
      
      // Notify parent component
      if (onEmailSent) {
        onEmailSent(data.case)
      }
      
      // Show success message
      alert('E-mail enviado com sucesso!')
    } catch (err) {
      console.error('Error sending email:', err)
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o e-mail')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-fit" variant="default" onClick={openDialog}>
          <Mail className="h-4 w-4 mr-2" />
          Enviar e-mail
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>Enviar e-mail</DialogTitle>
          <DialogDescription>
            Escreva uma mensagem para o cliente. O e-mail será registrado nas comunicações do caso.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {error && (
            <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
              {error}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="email-to">Para</Label>
            <Input
              id="email-to"
              type="email"
              placeholder="cliente@exemplo.com"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              disabled={sending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email-subject">Assunto</Label>
            <Input
              id="email-subject"
              type="text"
              placeholder="Assunto do e-mail"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              disabled={sending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email-content">Mensagem</Label>
            <Textarea
              id="email-content"
              placeholder="Digite sua mensagem..."
              value={emailContent}
              onChange={(e) => setEmailContent(e.target.value)}
              rows={8}
              disabled={sending}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={sending}
          >
            Cancelar
          </Button>
          <Button onClick={handleSendEmail} disabled={sending}>
            {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {sending ? 'Enviando...' : 'Enviar e-mail'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
