import asyncio
import json
import unittest
from types import SimpleNamespace
from municipal_extractor import MunicipalQuestionsRequest, propose_questions

class MunicipalQuestionsTests(unittest.TestCase):
    def request(self):
        return MunicipalQuestionsRequest(context={"municipality": "Prefeitura fictícia", "name": "Alvará"}, gaps=[{"category": "documents", "question": "Quais documentos são obrigatórios?"}])
    def model(self, output):
        def generate(**kwargs):
            if isinstance(output, Exception):
                raise output
            return SimpleNamespace(text=json.dumps(output))
        return SimpleNamespace(model_id="test-model", client=SimpleNamespace(models=SimpleNamespace(generate_content=generate)))
    def test_without_credentials(self):
        self.assertEqual(asyncio.run(propose_questions(self.request(), None)), {"mode": "local"})
    def test_grounded_questions(self):
        result=asyncio.run(propose_questions(self.request(), self.model({"questions":[{"category":"documents","text":"Quais documentos são obrigatórios para este alvará?"}]})))
        self.assertEqual(result["mode"], "gemini")
        self.assertEqual(len(result["questions"]), 1)
    def test_out_of_scope_and_duplicate_questions_fall_back(self):
        for questions in [[{"category":"deadlines","text":"Qual é o prazo?"}],[{"category":"documents","text":"Quais documentos são necessários?"}]*2,[{"category":"documents","text":"Quais documentos são necessários?"}]*6]:
            with self.subTest(questions=questions):
                result=asyncio.run(propose_questions(self.request(), self.model({"questions":questions})))
                self.assertEqual(result["mode"], "local")
                self.assertIn("warning", result)
    def test_service_failure_falls_back(self):
        result=asyncio.run(propose_questions(self.request(), self.model(RuntimeError("service unavailable"))))
        self.assertEqual(result["mode"], "local")
        self.assertIn("warning", result)

if __name__ == "__main__":
    unittest.main()
