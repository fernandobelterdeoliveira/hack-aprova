import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export type PreparedAttachment = {
  bytes: Buffer
  name: string
  mimeType: string
  sourceExternalId?: string
  metadata?: Record<string, unknown>
}

const MAX_BYTES = Number(process.env.CONNECTOR_MAX_FILE_BYTES || 25 * 1024 * 1024)

function provider() {
  return process.env.OBJECT_STORAGE_PROVIDER === "s3" ? "s3" : "local"
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-180) || "arquivo"
}

function localRoot() {
  return path.resolve(process.env.LOCAL_STORAGE_PATH || path.join(process.cwd(), "data", "connector-storage"))
}

function s3Client() {
  return new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY ? {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    } : undefined,
  })
}

function storageSecret() {
  const value = process.env.STORAGE_SIGNING_SECRET || process.env.CONNECTOR_ENCRYPTION_KEY
  if (!value || value.length < 24) throw new Error("STORAGE_SIGNING_SECRET deve possuir pelo menos 24 caracteres")
  return value
}

export function signedStoragePath(id: string, ttlSeconds = 3600) {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds
  const signature = createHmac("sha256", storageSecret()).update(`${id}:${expires}`).digest("base64url")
  return `/api/storage/${encodeURIComponent(id)}?expires=${expires}&sig=${signature}`
}

export function verifyStorageSignature(id: string, expiresValue: string | null, signature: string | null) {
  const expires = Number(expiresValue)
  if (!expires || expires < Math.floor(Date.now() / 1000) || !signature) return false
  const expected = createHmac("sha256", storageSecret()).update(`${id}:${expires}`).digest()
  const received = Buffer.from(signature, "base64url")
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export async function persistAttachment(input: PreparedAttachment & {
  sourceProvider: string
  connectorAccountId?: string | null
  connectorDeliveryId?: string | null
}) {
  if (!input.bytes.length) throw new Error("Anexo vazio")
  if (input.bytes.length > MAX_BYTES) throw new Error(`Anexo excede o limite de ${MAX_BYTES} bytes`)
  const sha256 = createHash("sha256").update(input.bytes).digest("hex")
  const storageKey = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName(input.name)}`
  if (provider() === "s3") {
    const bucket = process.env.S3_BUCKET
    if (!bucket) throw new Error("S3_BUCKET não configurado")
    await s3Client().send(new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: input.bytes,
      ContentType: input.mimeType,
      Metadata: { sha256 },
    }))
  } else {
    const target = path.resolve(localRoot(), storageKey)
    const root = localRoot()
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Chave de armazenamento inválida")
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, input.bytes, { flag: "wx" })
  }
  return prisma.storedObject.create({
    data: {
      storageProvider: provider(),
      storageKey,
      originalName: input.name,
      mimeType: input.mimeType || "application/octet-stream",
      sizeBytes: input.bytes.length,
      sha256,
      sourceProvider: input.sourceProvider,
      sourceExternalId: input.sourceExternalId,
      connectorAccountId: input.connectorAccountId || null,
      connectorDeliveryId: input.connectorDeliveryId || null,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  })
}

export async function readStoredObject(storageProvider: string, storageKey: string) {
  if (storageProvider === "s3") {
    const bucket = process.env.S3_BUCKET
    if (!bucket) throw new Error("S3_BUCKET não configurado")
    const response = await s3Client().send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }))
    if (!response.Body) throw new Error("Objeto não encontrado no storage")
    return Buffer.from(await response.Body.transformToByteArray())
  }
  const target = path.resolve(localRoot(), storageKey)
  const root = localRoot()
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Chave de armazenamento inválida")
  return readFile(target)
}
