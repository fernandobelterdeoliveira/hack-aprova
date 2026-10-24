import asyncio
import os
import tempfile
import unittest
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from agents.client_coms_agent.agent import ClientCommunicationAgent
from api_server import app
from ingestion_extractor import IngestionExtractionRequest, StructuredIngestionExtractor
from utils.file_converter import FileConverter


def extraction_request(content: str) -> IngestionExtractionRequest:
    return IngestionExtractionRequest(
        inbox_item_id="test-inbox-item",
        source_type="whatsapp",
        content=content,
        received_at=datetime.now(timezone.utc).isoformat(),
    )


class IngestionExtractorTests(unittest.TestCase):
    def test_treatment_message_proposes_sourced_event_and_gap(self):
        result = asyncio.run(
            StructuredIngestionExtractor().extract(
                extraction_request("Comecei fisioterapia hoje.")
            )
        )

        self.assertTrue(result.fallback_used)
        self.assertEqual([change.type for change in result.changes], ["EVENT", "GAP"])
        self.assertEqual(result.changes[0].evidence.source_id, "test-inbox-item")
        self.assertIn("fisioterapia", result.changes[0].evidence.excerpt)

    def test_named_provider_does_not_create_provider_gap(self):
        result = asyncio.run(
            StructuredIngestionExtractor().extract(
                extraction_request("Comecei fisioterapia na Clinica Central hoje.")
            )
        )

        self.assertEqual([change.type for change in result.changes], ["EVENT"])


class ApiTests(unittest.TestCase):
    def test_health_endpoint(self):
        with TestClient(app) as client:
            response = client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "healthy")

    def test_ingestion_endpoint_returns_typed_changes(self):
        payload = extraction_request("Recebi uma proposta de acordo hoje.").model_dump()
        with TestClient(app) as client:
            response = client.post("/api/ingestion/extract", json=payload)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["changes"][0]["type"], "EVENT")
        self.assertEqual(body["changes"][0]["data"]["eventType"], "settlement_update")


class LocalUtilitiesTests(unittest.TestCase):
    def test_plain_text_conversion(self):
        descriptor, path = tempfile.mkstemp(suffix=".txt", text=True)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                handle.write("Case fact with a traceable source.")

            result = FileConverter().convert_to_text(path)
            self.assertTrue(result["success"])
            self.assertEqual(result["file_type"], "text")
            self.assertIn("traceable source", result["text"])
        finally:
            if os.path.exists(path):
                os.remove(path)

    def test_communication_draft_is_returned_without_ml_dependency(self):
        agent = ClientCommunicationAgent.__new__(ClientCommunicationAgent)
        draft = agent.draft_response("Thank you for the update")

        self.assertIsInstance(draft, dict)
        self.assertTrue(draft["requires_review"])
        self.assertEqual(draft["emotion_analysis"]["primary_emotion"], "Positive")


if __name__ == "__main__":
    unittest.main()
