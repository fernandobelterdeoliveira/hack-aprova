import { createHash } from "node:crypto"

export type EmbeddingResult = {
  vectors: number[][]
  provider: string
  model: string
  modelVersion: string | null
  tokenUsage?: { inputTokens: number }
}

export interface EmbeddingProvider {
  readonly name: string
  readonly model: string
  isConfigured(): boolean
  embed(texts: string[]): Promise<EmbeddingResult>
}

const LOCAL_DIMENSIONS = 128

function normalizeVector(vector: number[]) {
  const magnitude = Math.hypot(...vector)
  return magnitude ? vector.map((value) => value / magnitude) : vector
}

function deterministicVector(text: string) {
  const vector = Array.from({ length: LOCAL_DIMENSIONS }, () => 0)
  const tokens = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)

  for (const token of tokens) {
    const bytes = createHash("sha256").update(token).digest()
    const index = bytes.readUInt16BE(0) % LOCAL_DIMENSIONS
    vector[index] += bytes[2] % 2 === 0 ? 1 : -1
  }
  return normalizeVector(vector)
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local"
  readonly model = "feature-hash-128-v1"

  isConfigured() {
    return true
  }

  async embed(texts: string[]): Promise<EmbeddingResult> {
    return {
      vectors: texts.map(deterministicVector),
      provider: this.name,
      model: this.model,
      modelVersion: "1",
    }
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai"
  readonly model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small"

  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY)
  }

  async embed(texts: string[]): Promise<EmbeddingResult> {
    if (!this.isConfigured()) throw new Error("OPENAI_API_KEY não configurada")
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        encoding_format: "float",
      }),
    })
    if (!response.ok) throw new Error(`OpenAI embeddings retornou ${response.status}`)
    const payload = await response.json() as {
      model: string
      data: Array<{ index: number; embedding: number[] }>
      usage?: { prompt_tokens?: number }
    }
    return {
      vectors: payload.data.sort((a, b) => a.index - b.index).map((entry) => entry.embedding),
      provider: this.name,
      model: payload.model || this.model,
      modelVersion: payload.model || null,
      tokenUsage: { inputTokens: payload.usage?.prompt_tokens || 0 },
    }
  }
}

export function configuredEmbeddingProvider(): EmbeddingProvider {
  const requested = process.env.EMBEDDING_PROVIDER || "local"
  if (requested === "openai") {
    const provider = new OpenAIEmbeddingProvider()
    if (provider.isConfigured()) return provider
  }
  return new LocalEmbeddingProvider()
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return 0
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftMagnitude += left[index] ** 2
    rightMagnitude += right[index] ** 2
  }
  if (!leftMagnitude || !rightMagnitude) return 0
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude))
}
