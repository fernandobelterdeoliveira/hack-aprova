import { z } from "zod"

const responseSchema = z.object({
  changes: z.array(z.object({
    type: z.enum(["FACT", "EVENT", "TASK", "GAP", "DEADLINE"]),
    confidence: z.number().min(0).max(1),
    risk_level: z.enum(["low", "medium", "high"]),
    data: z.record(z.string(), z.unknown()),
    evidence: z.object({
      source: z.string(),
      source_id: z.string(),
      excerpt: z.string(),
      page: z.number().int().positive().nullable().optional(),
    }),
  })),
  model: z.string(),
  prompt_version: z.string(),
  extractor_version: z.string(),
  processing_version: z.string(),
  processed_at: z.string(),
  fallback_used: z.boolean().optional(),
})

export type ExtractedChange = {
  type: "FACT" | "EVENT" | "TASK" | "GAP" | "DEADLINE"
  confidence: number
  riskLevel: "low" | "medium" | "high"
  payload: Record<string, unknown>
}

export type ExtractionResult = {
  changes: ExtractedChange[]
  model: string
  promptVersion: string
  extractorVersion: string
  processingVersion: string
  processedAt: string
  fallbackUsed: boolean
}

export async function extractStructuredChanges(input: {
  id: string
  sourceType: string
  rawContent: string
  receivedAt: Date
  fileName?: string | null
  fileType?: string | null
}, options?: { signal?: AbortSignal }): Promise<ExtractionResult | null> {
  const baseUrl = process.env.INGESTION_EXTRACTOR_URL
  if (!baseUrl) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/ingestion/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inbox_item_id: input.id,
        source_type: input.sourceType,
        content: input.rawContent,
        received_at: input.receivedAt.toISOString(),
        file_name: input.fileName,
        file_type: input.fileType,
      }),
      signal: options?.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal,
    })
    if (!response.ok) throw new Error(`Extractor returned ${response.status}`)
    const result = responseSchema.parse(await response.json())
    return {
      changes: result.changes.map((change) => ({
        type: change.type,
        confidence: change.confidence,
        riskLevel: change.risk_level,
        payload: {
          ...change.data,
          evidence: {
            source: change.evidence.source,
            sourceId: change.evidence.source_id,
            excerpt: change.evidence.excerpt,
            page: change.evidence.page,
          },
        },
      })),
      model: result.model,
      promptVersion: result.prompt_version,
      extractorVersion: result.extractor_version,
      processingVersion: result.processing_version,
      processedAt: result.processed_at,
      fallbackUsed: result.fallback_used || false,
    }
  } finally {
    clearTimeout(timeout)
  }
}
