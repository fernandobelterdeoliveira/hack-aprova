const baseUrl = process.env.APP_BASE_URL || "http://localhost:3001"
const secret = process.env.CONNECTOR_CRON_SECRET
const intervalMs = Number(process.env.CONNECTOR_RENEW_INTERVAL_MS || 6 * 60 * 60 * 1000)

if (!secret) throw new Error("CONNECTOR_CRON_SECRET não configurado")

async function renew() {
  const response = await fetch(`${baseUrl}/api/cron/connectors/renew`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } })
  const body = await response.text()
  if (!response.ok) throw new Error(`Renovação retornou ${response.status}: ${body}`)
  process.stdout.write(`[${new Date().toISOString()}] ${body}\n`)
}

await renew()
const timer = setInterval(() => renew().catch((error) => process.stderr.write(`[${new Date().toISOString()}] ${error.message}\n`)), intervalMs)
process.on("SIGINT", () => { clearInterval(timer); process.exit(0) })
process.on("SIGTERM", () => { clearInterval(timer); process.exit(0) })
