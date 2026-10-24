# LexiLoop — Case-Centric Architecture

## Product principle

The case is the system of record. AI agents are capabilities that propose changes
to a case; they are not the product's source of truth.

Every incoming item must answer:

1. Who sent it?
2. Which client and case does it belong to?
3. What facts and events does it contain?
4. What changed in the case state?
5. What information is still missing?
6. What action should happen next, and who must approve it?

## Target flow

```text
Email / WhatsApp / upload / audio / scanner
                      ↓
              Ingestion gateway
                      ↓
          Client and case resolution
                      ↓
       Multimodal document understanding
                      ↓
       Facts + events + source provenance
                      ↓
              Persistent case state
          ┌───────────┼───────────┐
          ↓           ↓           ↓
       Timeline   Information   Deadlines
                    gaps
          └───────────┼───────────┘
                      ↓
              Task and alert engine
                      ↓
              Case intelligence
                      ↓
              Next best action
                      ↓
           Risk-based human approval
                      ↓
         Message / task / case update
```

## Core records

- **CaseState**: current operational summary, stage, health score, and version.
- **CaseEvent**: a normalized occurrence with date, origin, and confidence.
- **CaseFact**: an atomic fact linked to its source, page, excerpt, and reviewer.
- **InformationGap**: an explicit unknown with a suggested follow-up question.
- **AITask**: an executable next action with owner, priority, status, and due date.
- **ReasonChain**: a reviewable recommendation; it is not itself a verified fact.

## Safety rules

- Facts, inferences, recommendations, and client communications must remain
  distinguishable in storage and in the interface.
- High-risk actions require attorney approval. Medium-risk actions require staff
  review. Only low-risk acknowledgements may be sent automatically.
- An extracted fact without provenance must not be shown as verified.
- Source files are immutable; derived text and structured records are versioned.
- Every automated state change creates an auditable event.

## Implemented in the first refactor

- Persistent Prisma models for case state, events, sourced facts, and gaps.
- `GET /api/cases/{id}/state` for the operational case snapshot.
- `POST /api/cases/{id}/state` for transactional event recording.
- Case-focused dashboard and case list.
- Case workspace with current state, next action, gaps, source coverage,
  timeline, tasks, and separate case intelligence.
- Shared application shell replacing the duplicated 3D layouts.
- Internal ingestion inbox for simulated messages and documents.
- Multi-signal case matching using case number, identity, prior communications,
  and case context.
- Staged `ProposedCaseChange` records that must be reviewed before application.
- Transactional approval that creates official events, facts, gaps, or tasks.
- Explicit high-risk handling for detected legal deadlines.
- SHA-256 content fingerprints and external IDs for webhook idempotency.
- Deduplication keys on official facts, events, gaps, and tasks.
- Versioned processing runs recording model, prompt, extractor, and pipeline.
- Typed Python extraction contract with exact evidence excerpts.
- Review UI that separates source, interpretation, association rationale,
  proposed mutations, provenance, confidence, and processing versions.

## Next implementation slices

1. Apply migrations to a PostgreSQL environment and run transactional tests.
2. Add hybrid semantic matching while retaining deterministic identity signals.
3. Pass OCR/STT and page coordinates through the structured Python contract.
4. Recompute `CaseState` whenever a verified event or fact changes.
5. Add editable proposed-change payloads and authenticated reviewer identities.
6. Build an evaluation set for matching, extraction, provenance, and safety.
7. Connect Gmail/Outlook and WhatsApp providers with idempotent webhooks.

## Operational case workspace iteration

The case detail now consumes an evidence-backed operational projection built
from the existing case-centric records. It separates confirmed facts,
allegations, contradictions and unverified information; combines official
events, documents, communications and completed tasks in one timeline; and
derives risks, document coverage, open gaps, recent changes and the next best
operational action without mutating the ingestion or approval pipeline.

New read models and endpoints:

- `GET /api/cases/{id}` returns the operational projection while preserving
  legacy top-level case fields;
- `POST /api/cases/{id}/search` searches only existing case evidence;
- `POST /api/cases/{id}/summary` regenerates the operational summary from
  official records and records its sources and warnings;
- `GET /api/cases/{id}/document-context` prepares a sourced context for future
  human-reviewed document drafting.

The deterministic summary and search are intentional safe fallbacks. They do
not create facts, apply proposals or make legal decisions.

Case data can be corrected from the operational page. Every edit creates a
`CaseDataChange` record with the old value, new value, user and timestamp.
Removing an extracted fact uses `archivedAt`/`archivedBy` instead of physically
deleting evidence. Archived facts no longer appear in the case view, search,
summary, MCP tools or Case Intelligence reads, but remain available for audit.

## Hybrid AI iteration

The ingestion flow now has provider-independent typed decision contracts,
explainable hybrid association, an explicit policy engine, AI execution audit
records, embedding records, and an evidence-only Case Intelligence Agent. See
`HYBRID_AI_ARCHITECTURE.md` for the implemented providers, safety boundaries,
database migration, benchmark endpoint, and current limitations.
