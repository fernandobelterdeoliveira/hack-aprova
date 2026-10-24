"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Sparkles, Loader2, CheckCircle2, AlertCircle, FileText } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface AIAnalysisDialogProps {
  caseId: string
  files: Array<{
    id: string
    name: string
    url: string
    type: string
  }>
  onAnalysisComplete?: (analysis: unknown) => void
}

interface AnalysisResult {
  agent_type?: string
  workflow?: string
  response?: string
  analysis?: {
    consensus?: string
    iterations?: number
  }
}

export function AIAnalysisDialog({ caseId, files, onAnalysisComplete }: AIAnalysisDialogProps) {
  const [open, setOpen] = useState(false)
  const [userRequest, setUserRequest] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileToggle = (fileId: string) => {
    setSelectedFiles(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    )
  }

  const handleSelectAll = () => {
    if (selectedFiles.length === files.length) {
      setSelectedFiles([])
    } else {
      setSelectedFiles(files.map(f => f.id))
    }
  }

  const handleAnalyze = async () => {
    if (!userRequest.trim()) {
      setError("Informe o que você deseja analisar")
      return
    }

    if (selectedFiles.length === 0) {
      setError("Selecione pelo menos um arquivo")
      return
    }

    setAnalyzing(true)
    setError(null)
    setResult(null)

    try {
      const fileUrls = files
        .filter(f => selectedFiles.includes(f.id))
        .map(f => f.url)

      // Show estimated time based on file count
      const estimatedSeconds = 30 + (fileUrls.length * 10)
      console.log(`Analyzing ${fileUrls.length} files - estimated time: ${estimatedSeconds}s`)

      const response = await fetch(`/api/cases/${caseId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userRequest,
          fileUrls,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "A análise falhou")
      }

      const data = await response.json()
      setResult(data.analysis)
      
      if (onAnalysisComplete) {
        onAnalysisComplete(data)
      }
    } catch (err) {
      console.error("Analysis error:", err)
      setError(err instanceof Error ? err.message : "Não foi possível analisar o caso")
    } finally {
      setAnalyzing(false)
    }
  }

  const handleReset = () => {
    setUserRequest("")
    setSelectedFiles([])
    setResult(null)
    setError(null)
  }

  const suggestedPrompts = [
    "Analise este caso e apresente recomendações estratégicas",
    "Quais são os fatos principais e a linha do tempo?",
    "Calcule os possíveis danos e o valor de acordo",
    "Identifique inconsistências ou provas ausentes",
    "Redija uma notificação com base nestes documentos",
    "Quais são os pontos fortes e fracos deste caso?",
  ]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Sparkles className="h-4 w-4 mr-2" />
          Análise com IA
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Análise do caso com IA</DialogTitle>
          <DialogDescription>
            Selecione os documentos e descreva o que deve ser analisado.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-2">
          <div className="space-y-6 py-4">
            {/* Request Input */}
            {!result && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="request">O que você deseja saber?</Label>
                  <Textarea
                    id="request"
                    placeholder="Ex.: analise este caso e apresente recomendações estratégicas..."
                    value={userRequest}
                    onChange={(e) => setUserRequest(e.target.value)}
                    rows={4}
                    disabled={analyzing}
                  />
                  
                  {/* Suggested Prompts */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {suggestedPrompts.map((prompt, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="cursor-pointer hover:bg-accent"
                        onClick={() => setUserRequest(prompt)}
                      >
                        {prompt}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* File Selection */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Selecionar documentos ({selectedFiles.length} de {files.length})</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSelectAll}
                    >
                      {selectedFiles.length === files.length ? "Desmarcar todos" : "Selecionar todos"}
                    </Button>
                  </div>

                  {files.length === 0 ? (
                    <Card>
                      <CardContent className="flex flex-col items-center justify-center py-8">
                        <FileText className="h-12 w-12 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">Nenhum documento disponível</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2 border rounded-lg p-4 max-h-[200px] overflow-y-auto">
                      {files.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center space-x-3 p-2 rounded-md"
                        >
                          <Checkbox
                            id={file.id}
                            checked={selectedFiles.includes(file.id)}
                            onCheckedChange={() => handleFileToggle(file.id)}
                          />
                          <label
                            htmlFor={file.id}
                            className="flex-1 cursor-pointer text-sm"
                          >
                            <div className="font-medium">{file.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {file.type.toUpperCase()}
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Analysis Result */}
            {result && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Análise concluída</span>
                </div>

                {result.agent_type && (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Agente: {result.agent_type}</Badge>
                    {result.workflow && (
                      <Badge variant="outline">{result.workflow}</Badge>
                    )}
                  </div>
                )}

                <Card>
                  <CardContent className="pt-6">
                    <div className="max-w-none text-foreground">
                      <div className="whitespace-pre-wrap text-sm leading-6">{result.response}</div>
                    </div>
                  </CardContent>
                </Card>

                {result.analysis && (
                  <Card>
                    <CardContent className="pt-6">
                      <h4 className="font-semibold mb-2">Análise detalhada</h4>
                      <div className="space-y-2 text-sm">
                        {result.analysis.consensus && (
                          <div>
                            <span className="font-medium">Conclusão:</span>
                            <p className="text-muted-foreground mt-1">{result.analysis.consensus}</p>
                          </div>
                        )}
                        {result.analysis.iterations && (
                          <p className="text-muted-foreground">
                            Os agentes trocaram {result.analysis.iterations} mensagens
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md">
                <AlertCircle className="h-5 w-5" />
                <span className="text-sm">{error}</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4">
          {result ? (
            <>
              <Button variant="outline" onClick={handleReset}>
                Nova análise
              </Button>
              <Button onClick={() => setOpen(false)}>
                Fechar
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={analyzing}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAnalyze}
                disabled={analyzing || !userRequest.trim() || selectedFiles.length === 0}
              >
                {analyzing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {analyzing ? `Analisando ${selectedFiles.length} arquivo(s)... (30–60 s)` : "Analisar"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
