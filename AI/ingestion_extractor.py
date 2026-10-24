import asyncio
import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

PROMPT_VERSION = "case-change-extraction-v1"
EXTRACTOR_VERSION = "1.0.0"
PROCESSING_VERSION = "ingestion-v2"


class IngestionExtractionRequest(BaseModel):
    inbox_item_id: str
    source_type: str
    content: str = Field(..., min_length=1)
    received_at: str
    file_name: Optional[str] = None
    file_type: Optional[str] = None


class Evidence(BaseModel):
    source: str
    source_id: str
    excerpt: str
    page: Optional[int] = None


class StructuredChange(BaseModel):
    type: Literal["FACT", "EVENT", "TASK", "GAP", "DEADLINE"]
    confidence: float = Field(..., ge=0, le=1)
    risk_level: Literal["low", "medium", "high"] = "medium"
    data: Dict[str, Any]
    evidence: Evidence


class IngestionExtractionResponse(BaseModel):
    changes: List[StructuredChange]
    model: str
    prompt_version: str = PROMPT_VERSION
    extractor_version: str = EXTRACTOR_VERSION
    processing_version: str = PROCESSING_VERSION
    processed_at: str
    fallback_used: bool = False


class StructuredIngestionExtractor:
    def __init__(self, client=None, model_id: str = "gemini-2.5-flash"):
        self.client = client
        self.model_id = model_id

    async def extract(self, request: IngestionExtractionRequest) -> IngestionExtractionResponse:
        if self.client is None:
            return self._fallback(request)
        try:
            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=self.model_id,
                contents=self._prompt(request),
            )
            raw = re.sub(
                r"^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$",
                "",
                (response.text or "").strip(),
                flags=re.I,
            )
            payload = json.loads(raw)
            changes = [StructuredChange(**change) for change in payload.get("changes", [])]
            return IngestionExtractionResponse(
                changes=changes,
                model=self.model_id,
                processed_at=datetime.now(timezone.utc).isoformat(),
            )
        except Exception:
            return self._fallback(request)

    def _prompt(self, request: IngestionExtractionRequest) -> str:
        return f"""
Extract proposed changes from legal-office intake. Return JSON only.
Never invent facts. Every change needs an exact source excerpt.
Legal deadlines are always high risk.
Write every human-readable title, description, question, and explanation in Brazilian Portuguese.

Schema:
{{
  "changes": [{{
    "type": "FACT|EVENT|TASK|GAP|DEADLINE",
    "confidence": 0.0,
    "risk_level": "low|medium|high",
    "data": {{}},
    "evidence": {{
      "source": "{request.source_type}",
      "source_id": "{request.inbox_item_id}",
      "excerpt": "exact excerpt",
      "page": null
    }}
  }}]
}}

Received at: {request.received_at}
File: {request.file_name or "none"}
Content:
{request.content}
"""

    def _fallback(self, request: IngestionExtractionRequest) -> IngestionExtractionResponse:
        content = request.content.strip()
        lowered = content.lower()
        event_type = "client_update"
        if any(term in lowered for term in ["fisioterapia", "physical therapy", "tratamento", "hospital"]):
            event_type = "medical_update"
        elif any(term in lowered for term in ["acordo", "settlement", "offer", "seguradora"]):
            event_type = "settlement_update"

        evidence = Evidence(
            source=request.source_type,
            source_id=request.inbox_item_id,
            excerpt=content[:500],
        )
        changes = [StructuredChange(
            type="EVENT",
            confidence=0.82,
            risk_level="medium",
            data={
                "eventType": event_type,
                "title": "Informação recebida",
                "description": content[:500],
                "occurredAt": request.received_at,
            },
            evidence=evidence,
        )]

        treatment_started = any(term in lowered for term in ["comecei", "iniciei", "started"]) and any(
            term in lowered for term in ["fisioterapia", "physical therapy", "tratamento"]
        )
        provider_named = any(term in lowered for term in ["clinica", "clinic", "hospital", "dr.", "dra."])
        if treatment_started and not provider_named:
            changes.append(StructuredChange(
                type="GAP",
                confidence=0.9,
                risk_level="medium",
                data={
                    "title": "Prestador do tratamento não identificado",
                    "description": "O tratamento foi informado sem a identificação da clínica ou do profissional.",
                    "priority": "high",
                    "suggestedQuestion": "Qual é o nome e o contato da clínica ou do profissional?",
                },
                evidence=evidence,
            ))

        return IngestionExtractionResponse(
            changes=changes,
            model="deterministic-fallback",
            processed_at=datetime.now(timezone.utc).isoformat(),
            fallback_used=True,
        )
