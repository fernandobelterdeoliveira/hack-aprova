import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

function secret(name: "CONNECTOR_ENCRYPTION_KEY" | "CONNECTOR_STATE_SECRET") {
  const value = process.env[name] || (name === "CONNECTOR_STATE_SECRET" ? process.env.CONNECTOR_ENCRYPTION_KEY : "")
  if (!value || value.length < 24) throw new Error(`${name} deve possuir pelo menos 24 caracteres`)
  return value
}

function encryptionKey() {
  return createHash("sha256").update(secret("CONNECTOR_ENCRYPTION_KEY")).digest()
}

export function encryptCredentials(value: unknown) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".")
}

export function decryptCredentials<T>(value: string): T {
  const [version, ivValue, tagValue, encryptedValue] = value.split(".")
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) throw new Error("Credencial criptografada inválida")
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"))
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"))
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8")) as T
}

export function signedState(payload: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify({ ...payload, nonce: randomBytes(16).toString("hex"), issuedAt: Date.now() })).toString("base64url")
  const signature = createHmac("sha256", secret("CONNECTOR_STATE_SECRET")).update(body).digest("base64url")
  return `${body}.${signature}`
}

export function verifyState<T>(state: string, maxAgeMs = 10 * 60 * 1000): T {
  const [body, signature] = state.split(".")
  if (!body || !signature) throw new Error("Estado OAuth inválido")
  const expected = createHmac("sha256", secret("CONNECTOR_STATE_SECRET")).update(body).digest()
  const received = Buffer.from(signature, "base64url")
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error("Assinatura OAuth inválida")
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { issuedAt?: number }
  if (!payload.issuedAt || Date.now() - payload.issuedAt > maxAgeMs) throw new Error("Estado OAuth expirado")
  return payload
}

export function verifyHmacSha256(rawBody: string, supplied: string | null, appSecret: string) {
  if (!supplied?.startsWith("sha256=")) return false
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex")
  const received = supplied.slice(7)
  if (expected.length !== received.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received))
}
