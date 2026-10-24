export type CaseStatus = "open" | "active" | "pending" | "closed" | "on-hold"
export type CasePriority = "low" | "medium" | "high" | "urgent"
export type AgentActionStatus = "pending" | "approved" | "rejected"
export type CommunicationType = "email" | "call" | "meeting" | "document"

export interface Case {
  id: string
  clientName: string
  caseType: string
  status: CaseStatus
  priority: CasePriority
  assignedTo: string
  createdAt: string
  lastActivity: string
  description: string
  municipalProcess?: {id:string;municipality:string;department:string;name:string;ticket:{id:string;status:string;currentVersionId:string|null}|null}|null
  nextAction?: string
  operational?: {
    staleDays: number
    hasGaps: boolean
    highRisk: boolean
    hasDeadline: boolean
    missingDocument: boolean
    awaitingReview: boolean
    hasContradiction: boolean
    unassigned: boolean
    unprocessedEntries: number
    gapCount: number
    taskCount: number
    documentCount: number
  }
}

export interface AgentAction {
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
}

export interface Communication {
  id: string
  caseId: string
  type: CommunicationType
  subject: string
  from: string
  to: string
  date: string
  content: string
  attachments?: string[]
}

export interface DashboardStats {
  totalCases: number
  activeCases: number
  pendingActions: number
  recentCommunications: number
}

export interface CaseFile {
  id: string
  caseId: string
  name: string
  url: string
  type: "pdf" | "audio" | "image" | "document" | "csv"
  size?: string
  uploadedAt: string
  uploadedBy: string
}
