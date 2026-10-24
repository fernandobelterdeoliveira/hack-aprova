import assert from "node:assert/strict"
import { createHmac, randomUUID } from "node:crypto"
import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

process.loadEnvFile?.(".env.local")
const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3001"
const signingSecret = process.env.TEST_STORAGE_SIGNING_SECRET || "connector-test-storage-secret-123456789"
const prisma = new PrismaClient()
const key = `test/${randomUUID()}-prova.txt`
const target = path.resolve(process.cwd(), "data", "connector-storage", key)
const bytes = Buffer.from("anexo privado de teste", "utf8")
let object

try {
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, bytes)
  object = await prisma.storedObject.create({ data: { storageProvider: "local", storageKey: key, originalName: "prova.txt", mimeType: "text/plain", sizeBytes: bytes.length, sha256: "test", sourceProvider: "test" } })
  const expires = Math.floor(Date.now() / 1000) + 60
  const sig = createHmac("sha256", signingSecret).update(`${object.id}:${expires}`).digest("base64url")
  const response = await fetch(`${baseUrl}/api/storage/${object.id}?expires=${expires}&sig=${sig}`)
  assert.equal(response.status, 200)
  assert.equal(await response.text(), bytes.toString("utf8"))
  const rejected = await fetch(`${baseUrl}/api/storage/${object.id}?expires=1&sig=${sig}`)
  assert.equal(rejected.status, 401)
  console.log("Storage test passed: arquivo privado persistido, assinatura válida e link expirado bloqueado.")
} finally {
  if (object) await prisma.storedObject.delete({ where: { id: object.id } })
  await rm(target, { force: true })
  await prisma.$disconnect()
}
