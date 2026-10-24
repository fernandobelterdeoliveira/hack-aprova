import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const cases = [
  {
    caseNumber: "LL-2026-0182",
    clientName: "João Silva",
    clientEmail: "joao@email.com",
    clientPhone: "+5511999991111",
    clientDob: "1988-04-12",
    caseType: "Motor Vehicle Accident",
    status: "active",
    priority: "high",
    assignedTo: "Alex Reyes",
    description: "Automobile accident on 08/08. Client remains in active medical treatment.",
    nextAction: "Confirm physical therapy provider and request records",
  },
  {
    caseNumber: "LL-2026-0239",
    clientName: "João Silva",
    clientEmail: "joao@email.com",
    clientPhone: "+5511999991111",
    clientDob: "1988-04-12",
    caseType: "Contract Dispute",
    status: "pending",
    priority: "medium",
    assignedTo: "Alex Reyes",
    description: "Commercial services contract dispute awaiting supporting invoices.",
    nextAction: "Collect invoices and executed agreement",
  },
  {
    caseNumber: "LL-2026-0314",
    clientName: "Sarah Johnson",
    clientEmail: "sarah@example.com",
    clientPhone: "+14075550123",
    clientDob: "1985-05-12",
    caseType: "Premises Liability",
    status: "active",
    priority: "high",
    assignedTo: "Emily Rodriguez",
    description: "Slip and fall with ongoing back treatment and missing provider records.",
    nextAction: "Request complete medical records",
  },
]

for (const lawCase of cases) {
  await prisma.case.upsert({
    where: { caseNumber: lawCase.caseNumber },
    update: lawCase,
    create: lawCase,
  })
}

const joao = await prisma.case.findUniqueOrThrow({ where: { caseNumber: "LL-2026-0182" } })
await prisma.email.upsert({
  where: { id: "seed-email-joao-1" },
  update: {},
  create: {
    id: "seed-email-joao-1",
    caseId: joao.id,
    from: "joao@email.com",
    to: "intake@lexiloop.local",
    subject: "Accident treatment update",
    content: "I am waiting for the MRI results after the accident.",
  },
})

console.log(`Seeded ${cases.length} cases`)
await prisma.$disconnect()
