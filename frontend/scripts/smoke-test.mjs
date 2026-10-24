import assert from "node:assert/strict"
import { PrismaClient } from "@prisma/client"

process.loadEnvFile?.(".env.local")

const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3001"
const prisma = new PrismaClient()
await prisma.case.deleteMany({
  where: { clientName: "Cliente de Teste", caseNumber: { startsWith: "SMOKE-" } },
})

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const contentType = response.headers.get("content-type") || ""
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text()
  assert.ok(response.ok, `${options?.method || "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`)
  return { response, body }
}

async function expectStatus(path, status, options) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const body = await response.json()
  assert.equal(response.status, status, `${options?.method || "GET"} ${path}: ${JSON.stringify(body)}`)
  return body
}

const pages = ["/", "/dashboard", "/inbox", "/cases", "/cases/new", "/actions", "/communications", "/profile", "/settings"]
for (const page of pages) {
  const { body } = await request(page)
  assert.equal(typeof body, "string")
  assert.ok(body.includes("<!DOCTYPE html>"), `${page} did not render HTML`)
}

const { body: cases } = await request("/api/cases")
assert.ok(Array.isArray(cases) && cases.length > 0, "Seeded case data is required")
const { body: searchResults } = await request(`/api/search?q=${encodeURIComponent(cases[0].caseNumber)}`)
assert.ok(searchResults.cases.some((item) => item.id === cases[0].id), "Global search must find a case by number")

const { body: profileData } = await request("/api/profile")
assert.equal(profileData.profile.id, "current-user")
assert.ok(Array.isArray(profileData.metrics.tokenActivity) && profileData.metrics.tokenActivity.length === 12)
const previousWeeklyDigest = profileData.profile.weeklyDigest
const previousTheme = profileData.profile.theme
const previousAccent = profileData.profile.accentColor
const previousDensity = profileData.profile.density
try {
  const { body: updatedProfile } = await request("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weeklyDigest: !previousWeeklyDigest, theme: "dark", accentColor: "violet", density: "compact" }),
  })
  assert.equal(updatedProfile.weeklyDigest, !previousWeeklyDigest)
  assert.equal(updatedProfile.theme, "dark")
  assert.equal(updatedProfile.accentColor, "violet")
  assert.equal(updatedProfile.density, "compact")
} finally {
  await request("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weeklyDigest: previousWeeklyDigest, theme: previousTheme, accentColor: previousAccent, density: previousDensity }),
  })
}
const exportedProfile = await request("/api/profile/export")
assert.match(exportedProfile.response.headers.get("content-disposition") || "", /attachment/)

const newCaseNumber = `SMOKE-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
let createdCaseId
try {
  const { response, body: createdCase } = await request("/api/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientName: "Cliente de Teste",
      clientEmail: "teste.cadastro@example.com",
      clientPhone: "+55 11 99999-0000",
      clientDob: "1990-01-15",
      caseType: "Validação do cadastro",
      caseNumber: newCaseNumber,
      status: "open",
      priority: "medium",
      assignedTo: "Equipe de Qualidade",
      description: "Caso temporário criado pelo teste automatizado do cadastro.",
      nextAction: "Validar a página de detalhes",
    }),
  })
  createdCaseId = createdCase.id
  assert.equal(response.status, 201)
  assert.equal(createdCase.caseNumber, newCaseNumber)
  assert.equal(createdCase.state.stage, "open")

  const { body: createdCaseDetail } = await request(`/api/cases/${createdCaseId}`)
  assert.equal(createdCaseDetail.clientName, "Cliente de Teste")
  const createdCasePage = await request(`/cases/${createdCaseId}`)
  assert.ok(createdCasePage.body.includes("<!DOCTYPE html>"), "New case detail page did not render HTML")
} finally {
  if (createdCaseId) await prisma.case.delete({ where: { id: createdCaseId } })
}

const targetCase = cases.find((item) => item.caseNumber === "LL-2026-0182") || cases[0]
const casePage = await request(`/cases/${targetCase.id}`)
assert.ok(casePage.body.includes("<!DOCTYPE html>"), "Case detail page did not render HTML")
const { body: caseDetail } = await request(`/api/cases/${targetCase.id}`)
assert.equal(caseDetail.id, targetCase.id)
const jsonHeaders = { "Content-Type": "application/json" }

let communicationId
try {
  const { response, body: communication } = await request("/api/communications", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      caseId: targetCase.id,
      type: "email",
      subject: "Registro temporário do teste",
      from: "qualidade@escritorio.test",
      to: "cliente@example.com",
      content: "Comunicação temporária criada pelo teste automatizado.",
    }),
  })
  communicationId = communication.id
  assert.equal(response.status, 201)
  assert.equal(communication.caseId, targetCase.id)
  const { body: communications } = await request("/api/communications")
  assert.ok(communications.some((item) => item.id === communicationId), "Registered communication was not listed")
} finally {
  if (communicationId) await prisma.email.delete({ where: { id: communicationId } })
}

await expectStatus(`/api/cases/${targetCase.id}/email`, 503, {
  method: "POST",
  headers: jsonHeaders,
  body: JSON.stringify({ to: "client@example.com", subject: "Smoke test", content: "Not delivered." }),
})
await expectStatus(`/api/cases/${targetCase.id}/call`, 503, {
  method: "POST",
  headers: jsonHeaders,
  body: JSON.stringify({ phoneNumber: "+15550000000", message: "Not delivered." }),
})
await expectStatus(`/api/cases/${targetCase.id}/analyze`, 503, {
  method: "POST",
  headers: jsonHeaders,
  body: JSON.stringify({ userRequest: "Smoke test", fileUrls: ["https://example.com/test.txt"] }),
})
const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const inboxPayload = {
  sourceType: "whatsapp",
  sourceExternalId: `smoke-${unique}`,
  senderName: targetCase.clientName,
  senderEmail: targetCase.clientEmail,
  rawContent: `Case ${targetCase.caseNumber}: comecei fisioterapia hoje.`,
  receivedAt: new Date().toISOString(),
}

const createOptions = {
  method: "POST",
  headers: jsonHeaders,
  body: JSON.stringify(inboxPayload),
}
const created = await request("/api/inbox", createOptions)
assert.equal(created.response.status, 201)
assert.equal(created.body.processingStatus, "completed")
assert.equal(created.body.reviewStatus, "ready")
assert.equal(created.body.detectedCaseId, targetCase.id)
assert.ok(created.body.proposedChanges.length > 0)

const duplicate = await request("/api/inbox", createOptions)
assert.equal(duplicate.body.id, created.body.id)
assert.equal(duplicate.response.headers.get("x-inbox-deduplicated"), "true")

const sameContentNewSource = await request("/api/inbox", {
  ...createOptions,
  body: JSON.stringify({ ...inboxPayload, sourceExternalId: `smoke-second-${unique}` }),
})
assert.equal(sameContentNewSource.response.status, 201)
assert.notEqual(sameContentNewSource.body.id, created.body.id, "Distinct channel messages must not be deduplicated by text alone")

const reviewOptions = {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "approve", caseId: targetCase.id, decidedBy: "smoke-test" }),
}
const approved = await request(`/api/inbox/${created.body.id}/review`, reviewOptions)
assert.equal(approved.body.applied, created.body.proposedChanges.length)

const replay = await request(`/api/inbox/${created.body.id}/review`, reviewOptions)
assert.equal(replay.body.applied, 0, "Review replay must be idempotent")

const { body: state } = await request(`/api/cases/${targetCase.id}/state`)
assert.ok(state.timeline.some((event) => event.sourceId === created.body.id), "Approved event was not added to the timeline")
assert.ok(state.gaps.some((gap) => gap.sourceEventId === created.body.id), "Approved gap was not added to the case")

await prisma.$disconnect()
console.log(`Smoke test passed: ${pages.length + 2} pages, profile/preferences, case creation, communication history, case APIs, ingestion, association, review, and idempotency.`)
