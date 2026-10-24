"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Check, X, Clock, AlertCircle, ChevronDown, ChevronUp } from "lucide-react"
import Link from "next/link"

type AgentActionStatus = "pending" | "approved" | "rejected"

interface AgentAction {
  id: string
  caseId: string
  caseName: string
  actionType: string
  description: string
  suggestedBy: string
  status: AgentActionStatus
  createdAt: string
  reasoning: string
  impact: "low" | "medium" | "high"
  confidence?: number
  case: {
    id: string
    clientName: string
    caseType: string
  }
}

export default function ActionsPage() {
  const [actions, setActions] = useState<AgentAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedAction, setExpandedAction] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<AgentActionStatus>("pending")

  useEffect(() => {
    fetchActions()
    const requestedTab = new URLSearchParams(window.location.search).get("tab")
    if (requestedTab && ["pending", "approved", "rejected"].includes(requestedTab)) {
      setActiveTab(requestedTab as AgentActionStatus)
    }
  }, [])

  async function fetchActions() {
    try {
      setLoading(true)
      const response = await fetch('/api/actions')
      
      if (!response.ok) {
        throw new Error('Não foi possível carregar as ações')
      }
      
      const data = await response.json()
      setActions(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (actionId: string) => {
    try {
      const response = await fetch(`/api/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' })
      })

      if (!response.ok) {
        throw new Error('Não foi possível aprovar a ação')
      }

      const updatedAction = await response.json()
      setActions((prev) => prev.map((a) => (a.id === actionId ? updatedAction : a)))
    } catch (err) {
      console.error('Error approving action:', err)
    }
  }

  const handleReject = async (actionId: string) => {
    try {
      const response = await fetch(`/api/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' })
      })

      if (!response.ok) {
        throw new Error('Não foi possível rejeitar a ação')
      }

      const updatedAction = await response.json()
      setActions((prev) => prev.map((a) => (a.id === actionId ? updatedAction : a)))
    } catch (err) {
      console.error('Error rejecting action:', err)
    }
  }

  const toggleExpand = (actionId: string) => {
    setExpandedAction(expandedAction === actionId ? null : actionId)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Clock className="h-12 w-12 text-muted-foreground mb-4 mx-auto animate-spin" />
          <p className="text-lg font-medium text-black">Carregando ações...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mb-4 mx-auto" />
          <p className="text-lg font-medium">Erro ao carregar ações</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  const pendingActions = actions.filter((a) => a.status === "pending")
  const approvedActions = actions.filter((a) => a.status === "approved")
  const rejectedActions = actions.filter((a) => a.status === "rejected")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-black">Ações sugeridas</h1>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revisão pendente</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingActions.length}</div>
            <p className="text-xs text-muted-foreground">Aguardando sua decisão</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aprovadas</CardTitle>
            <Check className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvedActions.length}</div>
            <p className="text-xs text-muted-foreground">Prontas para execução</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejeitadas</CardTitle>
            <X className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rejectedActions.length}</div>
            <p className="text-xs text-muted-foreground">Ações recusadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions List */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AgentActionStatus)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">
            Pendentes <Badge className="ml-2">{pendingActions.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approved">Aprovadas</TabsTrigger>
          <TabsTrigger value="rejected">Rejeitadas</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingActions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Check className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">Tudo em dia!</p>
                <p className="text-sm text-muted-foreground">Nenhuma ação pendente para revisar</p>
              </CardContent>
            </Card>
          ) : (
            pendingActions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                onApprove={handleApprove}
                onReject={handleReject}
                expanded={expandedAction === action.id}
                onToggleExpand={toggleExpand}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="approved" className="space-y-4">
          {approvedActions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">Nenhuma ação aprovada</p>
                <p className="text-sm text-muted-foreground">As ações aprovadas aparecerão aqui</p>
              </CardContent>
            </Card>
          ) : (
            approvedActions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                expanded={expandedAction === action.id}
                onToggleExpand={toggleExpand}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="rejected" className="space-y-4">
          {rejectedActions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">Nenhuma ação rejeitada</p>
                <p className="text-sm text-muted-foreground">As ações rejeitadas aparecerão aqui</p>
              </CardContent>
            </Card>
          ) : (
            rejectedActions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                expanded={expandedAction === action.id}
                onToggleExpand={toggleExpand}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface ActionCardProps {
  action: AgentAction
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  expanded: boolean
  onToggleExpand: (id: string) => void
}

function ActionCard({ action, onApprove, onReject, expanded, onToggleExpand }: ActionCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{action.actionType}</CardTitle>
              <Badge
                variant={
                  action.impact === "high" ? "destructive" : action.impact === "medium" ? "default" : "secondary"
                }
              >
                Impacto {action.impact === "high" ? "alto" : action.impact === "medium" ? "médio" : "baixo"}
              </Badge>
              {action.status === "approved" && (
                <Badge variant="default" className="bg-green-600">
                  <Check className="h-3 w-3 mr-1" />
                  Aprovada
                </Badge>
              )}
              {action.status === "rejected" && (
                <Badge variant="destructive">
                  <X className="h-3 w-3 mr-1" />
                  Rejeitada
                </Badge>
              )}
            </div>
            <CardDescription>
              <Link href={`/cases/${action.case.id}`} className="hover:underline">
                {action.caseName}
              </Link>
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onToggleExpand(action.id)}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-foreground">{action.description}</p>
        </div>

        {expanded && (
          <div className="space-y-3 pt-3 border-t">
            <div>
              <p className="text-sm font-medium mb-1">Justificativa da IA</p>
              <p className="text-sm text-muted-foreground">{action.reasoning}</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Sugerida por: {action.suggestedBy}</span>
              <span>•</span>
              <span>{new Date(action.createdAt).toLocaleString()}</span>
            </div>
          </div>
        )}

        {action.status === "pending" && onApprove && onReject && (
          <div className="flex gap-2 pt-2">
            <Button onClick={() => onApprove(action.id)} className="flex-1" size="sm">
              <Check className="h-4 w-4 mr-2" />
              Aprovar
            </Button>
            <Button onClick={() => onReject(action.id)} variant="outline" className="flex-1" size="sm">
              <X className="h-4 w-4 mr-2" />
              Rejeitar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
