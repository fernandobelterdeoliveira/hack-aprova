import asyncio
import os
from typing import List, Dict
from pathlib import Path
from dotenv import load_dotenv
from agent_orchastrator import AIOrchestrator
import sys
    


env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)


class TestCase:
    def __init__(self, name: str, description: str,user_request: str,file_urls: List[str],expected_agent_type: str,expected_workflow: str):
        self.name = name
        self.description = description
        self.user_request = user_request
        self.file_urls = file_urls
        self.expected_agent_type = expected_agent_type
        self.expected_workflow = expected_workflow


TEST_CASE_1_COMMUNICATIONS = TestCase(
    name="Email Communication Setup",
    description="Test routing to Communications Agent for email drafting",
    user_request="Please draft a professional email to the client explaining the settlement offer and next steps.",
    file_urls=[
        "https://simplylaw.s3.us-east-1.amazonaws.com/Ltr+from+AutoOwners+with+offer+of+%2418k_Redacted.pdf",
        "https://simplylaw.s3.us-east-1.amazonaws.com/File+Notes.docx"
    ],
    expected_agent_type="client_coms",
    expected_workflow="API → Orchestrator → Com → Out"
)



TEST_CASE_2_ANALYSIS = TestCase(
    name="Case Document Analysis",
    description="Test routing to Doc + Sherlock for deep analysis",
    user_request="Analyze these case documents and provide strategic recommendations for settlement negotiations.",
    file_urls=[
        "https://simplylaw.s3.us-east-1.amazonaws.com/POLICE+REPORT+(1).pdf",
        "https://simplylaw.s3.us-east-1.amazonaws.com/PIP+LOG+as+of+2_14_2020_Redacted.pdf",
        "https://simplylaw.s3.us-east-1.amazonaws.com/File+Notes.docx"
    ],
    expected_agent_type="analysis",
    expected_workflow="API → Orchestrator → Doc → Sherlock → Com → Out"
)


TEST_CASE_3_INSURANCE = TestCase(
    name="Insurance Policy Analysis",
    description="Test analysis of insurance documents",
    user_request="Review these insurance policies and identify coverage limits, exclusions, and opportunities.",
    file_urls=[
        "https://simplylaw.s3.us-east-1.amazonaws.com/INSURANCE-+POLICY+PROGRESSIVE++.pdf",
        "https://simplylaw.s3.us-east-1.amazonaws.com/Progressive+Dec_Redacted.pdf",
        "https://simplylaw.s3.us-east-1.amazonaws.com/Geico+Policy_Redacted.pdf"
    ],
    expected_agent_type="analysis",
    expected_workflow="API → Orchestrator → Doc → Sherlock → Com → Out"
)


TEST_CASE_4_PROPERTY = TestCase(
    name="Property Damage Analysis",
    description="Test analysis of property damage estimates and photos",
    user_request="Analyze the property damage estimates and photos to determine fair compensation value.",
    file_urls=[
        "https://simplylaw.s3.us-east-1.amazonaws.com/Property+damage+estimate_Redacted.pdf",
        "https://simplylaw.s3.us-east-1.amazonaws.com/EST-PHOTOS-04-15-2019_Redacted.pdf",
        "https://simplylaw.s3.us-east-1.amazonaws.com/PD+-+EST-ESTIMATE--10394-07-08-03-2021-16-13-37_Redacted.pdf"
    ],
    expected_agent_type="analysis",
    expected_workflow="API → Orchestrator → Doc → Sherlock → Com → Out"
)


TEST_CASE_5_AUDIO = TestCase(
    name="Audio Communication Analysis",
    description="Test handling of audio files with transcription and analysis",
    user_request="Transcribe and analyze these phone calls to understand the negotiation history.",
    file_urls=[
        "https://simplylaw.s3.us-east-1.amazonaws.com/File+4-+low+offer-+lawsuit.m4a",
        "https://simplylaw.s3.us-east-1.amazonaws.com/File+4-+call+about+demand.m4a",
        "https://simplylaw.s3.us-east-1.amazonaws.com/File+3-+first+call.m4a"
    ],
    expected_agent_type="analysis",
    expected_workflow="API → Orchestrator → Doc → Sherlock → Com → Out"
)

TEST_CASE_6_LIENS = TestCase(
    name="Medical Lien Analysis",
    description="Test analysis of medical liens for settlement",
    user_request="Review the medical liens and provide a strategy for lien negotiation and resolution.",
    file_urls=[
        "https://simplylaw.s3.us-east-1.amazonaws.com/LIEN+-+MEDICARE+(2)_Redacted.pdf",
        "https://simplylaw.s3.us-east-1.amazonaws.com/LIEN+-OPTUM+FINAL+LIEN+_Redacted.pdf",
        "https://simplylaw.s3.us-east-1.amazonaws.com/LIEN+-+MEDICARE+(1)_Redacted.pdf"
    ],
    expected_agent_type="analysis",
    expected_workflow="API → Orchestrator → Doc → Sherlock → Com → Out"
)

TEST_CASE_7_MIXED = TestCase(
    name="Mixed Media Comprehensive Analysis",
    description="Test handling of multiple file types (PDF, audio, images)",
    user_request="Analyze all evidence including documents, photos, and audio recordings to build a comprehensive case strategy.",
    file_urls=[
        "https://simplylaw.s3.us-east-1.amazonaws.com/POLICE+REPORT+(1).pdf",
        "https://simplylaw.s3.us-east-1.amazonaws.com/PD1.jpg",
        "https://simplylaw.s3.us-east-1.amazonaws.com/Scene1.jpg",
        "https://simplylaw.s3.us-east-1.amazonaws.com/File+3-+call+about+Tender.m4a",
        "https://simplylaw.s3.us-east-1.amazonaws.com/Insurance+Basics.docx"
    ],
    expected_agent_type="analysis",
    expected_workflow="API → Orchestrator → Doc → Sherlock → Com → Out"
)

TEST_CASE_8_CLIENT_UPDATE = TestCase(
    name="Client Status Update",
    description="Test communications agent for client updates",
    user_request="Create a status update email for the client summarizing the current case status and next steps.",
    file_urls=[
        "https://simplylaw.s3.us-east-1.amazonaws.com/File+Notes.docx",
        "https://simplylaw.s3.us-east-1.amazonaws.com/LTR+-+OFFER+28k+asking+for+sx+recoreds.pdf"
    ],
    expected_agent_type="client_coms",
    expected_workflow="API → Orchestrator → Com → Out"
)

ALL_TEST_CASES = [
    TEST_CASE_1_COMMUNICATIONS,
    TEST_CASE_2_ANALYSIS,
    TEST_CASE_3_INSURANCE,
    TEST_CASE_4_PROPERTY,
    TEST_CASE_5_AUDIO,
    TEST_CASE_6_LIENS,
    TEST_CASE_7_MIXED,
    TEST_CASE_8_CLIENT_UPDATE
]


class TestRunner:
    def __init__(self):
        self.orchestrator = None
        self.results: List[Dict] = []
    
    async def setup(self):
        print("🔧 Setting up test environment...")
        
        if not os.getenv("GOOGLE_API_KEY"):
            raise ValueError("GOOGLE_API_KEY environment variable required for testing")
        
        self.orchestrator = AIOrchestrator()
        print("✅ Orchestrator initialized\n")
    
    async def run_test(self, test_case: TestCase) -> Dict:
        print(f"\n{'='*80}")
        print(f"🧪 TEST: {test_case.name}")
        print(f"{'='*80}")
        print(f"Description: {test_case.description}")
        print(f"User Request: {test_case.user_request}")
        print(f"Files: {len(test_case.file_urls)}")
        print(f"Expected Agent: {test_case.expected_agent_type}")
        print(f"Expected Workflow: {test_case.expected_workflow}")
        print()
        
        try:
            result = await self.orchestrator.process_request(
                user_request=test_case.user_request,
                file_urls=test_case.file_urls
            )
            
            agent_match = result["agent_type"] == test_case.expected_agent_type
            workflow_match = result["workflow"] == test_case.expected_workflow
            
            test_result = {
                "test_name": test_case.name,
                "status": "PASS" if (agent_match and workflow_match) else "FAIL",
                "agent_type": result["agent_type"],
                "expected_agent_type": test_case.expected_agent_type,
                "agent_match": agent_match,
                "workflow": result["workflow"],
                "expected_workflow": test_case.expected_workflow,
                "workflow_match": workflow_match,
                "files_processed": result["files_processed"],
                "response_length": len(result.get("response", "")),
                "has_analysis": "analysis" in result,
                "error": None
            }
            
            print("📊 RESULTS:")
            print(f"   Status: {'✅ PASS' if test_result['status'] == 'PASS' else '❌ FAIL'}")
            print(f"   Agent Type: {result['agent_type']} (expected: {test_case.expected_agent_type}) {'✓' if agent_match else '✗'}")
            print(f"   Workflow: {result['workflow']}")
            print(f"   Files Processed: {result['files_processed']}")
            print(f"   Response Length: {test_result['response_length']} characters")
            
            if "analysis" in result:
                print(f"   Analysis Iterations: {result['analysis']['iterations']}")
                print(f"   Consensus Reached: {result['analysis'].get('consensus', 'N/A')}")
            
            print(f"\n   Response Preview:")
            print(f"   {result.get('response', '')[:200]}...")
            
            return test_result
            
        except Exception as e:
            print(f"❌ TEST FAILED WITH ERROR: {e}")
            return {
                "test_name": test_case.name,
                "status": "ERROR",
                "error": str(e)
            }
    
    async def run_all_tests(self, test_cases: List[TestCase] = None):
        if test_cases is None:
            test_cases = ALL_TEST_CASES
        
        print("\n" + "="*80)
        print("🚀 STARTING TEST SUITE")
        print("="*80)
        print(f"Total Tests: {len(test_cases)}")
        print()
        
        await self.setup()
        
        for i, test_case in enumerate(test_cases, 1):
            print(f"\n[Test {i}/{len(test_cases)}]")
            result = await self.run_test(test_case)
            self.results.append(result)
            
            await asyncio.sleep(2)
        
        self.print_summary()
    
    def print_summary(self):
        print("\n\n" + "="*80)
        print("📊 TEST SUMMARY")
        print("="*80)
        
        total = len(self.results)
        passed = sum(1 for r in self.results if r["status"] == "PASS")
        failed = sum(1 for r in self.results if r["status"] == "FAIL")
        errors = sum(1 for r in self.results if r["status"] == "ERROR")
        
        print(f"\nTotal Tests: {total}")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"💥 Errors: {errors}")
        print(f"Success Rate: {(passed/total*100):.1f}%")
        
        if failed > 0 or errors > 0:
            print("\nFailed/Error Tests:")
            for result in self.results:
                if result["status"] != "PASS":
                    print(f"  - {result['test_name']}: {result['status']}")
                    if result.get("error"):
                        print(f"    Error: {result['error']}")
        
        print("\n" + "="*80)


async def run_quick_test():
    runner = TestRunner()
    await runner.setup()
    
    result = await runner.run_test(TEST_CASE_1_COMMUNICATIONS)
    
    print("\n" + "="*80)
    print("QUICK TEST COMPLETE")
    print("="*80)
    print(f"Status: {result['status']}")


async def run_communication_tests():
    communication_tests = [
        TEST_CASE_1_COMMUNICATIONS,
        TEST_CASE_8_CLIENT_UPDATE
    ]
    
    runner = TestRunner()
    await runner.run_all_tests(communication_tests)


async def run_analysis_tests():
    analysis_tests = [
        TEST_CASE_2_ANALYSIS,
        TEST_CASE_3_INSURANCE,
        TEST_CASE_4_PROPERTY,
        TEST_CASE_5_AUDIO,
        TEST_CASE_6_LIENS,
        TEST_CASE_7_MIXED
    ]
    
    runner = TestRunner()
    await runner.run_all_tests(analysis_tests)


if __name__ == "__main__":
    print("""
╔════════════════════════════════════════════════════════════╗
║     Morgan AI Agent System - Test Suite                   ║
║                                                            ║
║  Tests: API → Orchestrator → Doc → Sherlock → Com → Out  ║
╚════════════════════════════════════════════════════════════╝
    """)
    
    if not os.getenv("GOOGLE_API_KEY"):
        print("❌ ERROR: GOOGLE_API_KEY environment variable not set")
        print("   Set it with: export GOOGLE_API_KEY='your-api-key'")
        sys.exit(1)
    
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()
        
        if command == "quick":
            print("Running quick test...")
            asyncio.run(run_quick_test())
        elif command == "communication":
            print("Running communication tests...")
            asyncio.run(run_communication_tests())
        elif command == "analysis":
            print("Running analysis tests...")
            asyncio.run(run_analysis_tests())
        elif command == "all":
            print("Running all tests...")
            runner = TestRunner()
            asyncio.run(runner.run_all_tests())
        else:
            print(f"Unknown command: {command}")
            print("Usage: python test_cases.py [quick|communication|analysis|all]")
    else:
        # Default: run all tests
        print("Running all tests (use 'quick', 'communication', 'analysis', or 'all' to specify)...\n")
        runner = TestRunner()
        asyncio.run(runner.run_all_tests())
