import os
from dotenv import load_dotenv
from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
import pytesseract
import cv2
import asyncio
import re
import json
from pathlib import Path
import PyPDF2
import speech_recognition as sr
from pydub import AudioSegment

load_dotenv(".env")

MODEL_ID = "gemini-2.5-flash"

class DocuAgent:
    def __init__(self):
        self.api_key = os.getenv("GOOGLE_API_KEY")
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY not set")
        
        self.agent = Agent(
            name="docu_agent",
            model=MODEL_ID,
            description="Assists with document-related tasks such as summarization, extraction, and analysis. Can process text files, PDFs, images, and audio files.",
            instruction=self.get_instruction(),
            tools=[
                self.extract_text_from_image,
                self.extract_text_from_pdf,
                self.extract_text_from_audio,
                self.process_text_file,
                self.summarize_document,
                self.classify_document,
                self.extract_key_information,
            ])
        
    def get_instruction(self):
        return """You are the Docu Agent for LexiLoop, specializing in document-related tasks.

Your responsibilities:
1. Extract text from images and scanned documents using OCR
2. Summarize legal documents into clear, actionable insights
3. Classify documents by type (medical records, police reports, bills, correspondence, etc.)
4. Extract key information like dates, amounts, parties involved, and critical facts
5. Identify missing documents that may be needed for the case
6. Organize documents logically for attorney review
7. Flag urgent or time-sensitive content in documents

Document Classification Types:
- Medical Records (bills, treatment notes, diagnoses)
- Police/Incident Reports
- Insurance Documents (policies, claims, correspondence)
- Financial Documents (bills, wages, expenses)
- Legal Documents (contracts, agreements, court filings)
- Communications (emails, letters, text messages)
- Evidence (photos, videos, physical evidence documentation)

Extraction Guidelines:
- Always note document date and source
- Highlight dollar amounts, deadlines, and dates
- Identify all parties mentioned (names, organizations)
- Extract contact information when present
- Flag inconsistencies or missing information
- Preserve legal terminology while adding plain language summaries

Quality Standards:
- High accuracy in OCR and extraction
- Clear, structured summaries
- Consistent classification
- Actionable insights for attorneys
- Privacy-conscious handling of sensitive information

You help attorneys process documents faster and clients understand their case materials better.
Always maintain confidentiality and accuracy in all document processing tasks.
"""
    
    def extract_text_from_image(self, image_path: str):
        if not os.path.exists(image_path):
            return {
                "success": False,
                "error": f"Image file not found: {image_path}",
                "text": ""
            }
        
        image = cv2.imread(image_path)
        if image is None:
            return {
                "success": False,
                "error": f"Failed to read image: {image_path}",
                "text": ""
            }

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        text = pytesseract.image_to_string(thresh)
        
        return {
            "success": True,
            "text": text,
            "image_path": image_path,
            "confidence": "high" if len(text) > 50 else "low",
            "preprocessed": True
        }
    
    def extract_text_from_pdf(self, pdf_path: str):
        if not os.path.exists(pdf_path):
            return {
                "success": False,
                "error": f"PDF file not found: {pdf_path}",
                "text": ""
            }
        
        try:
            text = ""
            with open(pdf_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                num_pages = len(pdf_reader.pages)
                
                for page_num in range(num_pages):
                    page = pdf_reader.pages[page_num]
                    text += page.extract_text() + "\n"
            
            return {
                "success": True,
                "text": text,
                "pdf_path": pdf_path,
                "num_pages": num_pages,
                "word_count": len(text.split())
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to read PDF: {str(e)}",
                "text": ""
            }
    
    def extract_text_from_audio(self, audio_path: str):
        if not os.path.exists(audio_path):
            return {
                "success": False,
                "error": f"Audio file not found: {audio_path}",
                "text": ""
            }
        
        try:
            recognizer = sr.Recognizer()
        
            audio = AudioSegment.from_file(audio_path)
            

            temp_wav = audio_path.rsplit('.', 1)[0] + '_temp.wav'
            audio.export(temp_wav, format='wav')
            
            with sr.AudioFile(temp_wav) as source:
                audio_data = recognizer.record(source)
                text = recognizer.recognize_google(audio_data)
        
            if os.path.exists(temp_wav):
                os.remove(temp_wav)
            
            return {
                "success": True,
                "text": text,
                "audio_path": audio_path,
                "duration_seconds": len(audio) / 1000.0,
                "transcription_method": "Google Speech Recognition"
            }
        except sr.UnknownValueError:
            return {
                "success": False,
                "error": "Speech recognition could not understand audio",
                "text": ""
            }
        except sr.RequestError as e:
            return {
                "success": False,
                "error": f"Could not request results from speech recognition service: {str(e)}",
                "text": ""
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to process audio: {str(e)}",
                "text": ""
            }
    
    def process_text_file(self, file_path: str):
        if not os.path.exists(file_path):
            return {
                "success": False,
                "error": f"Text file not found: {file_path}",
                "text": ""
            }
        
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                text = file.read()
            
            return {
                "success": True,
                "text": text,
                "file_path": file_path,
                "word_count": len(text.split()),
                "line_count": len(text.split('\n'))
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to read text file: {str(e)}",
                "text": ""
            }

    
    def summarize_document(self, document_text: str, document_type: str = "general"):
        word_count = len(document_text.split())
        
        summary_template = {
            "document_type": document_type,
            "word_count": word_count,
            "summary_sections": {
                "overview": "Brief overview will be generated",
                "key_points": [],
                "action_items": [],
                "dates_mentioned": [],
                "amounts_mentioned": [],
            },
            "requires_attorney_review": True,
            "priority": "normal"
        }
        
        return summary_template
    
    def classify_document(self, document_text: str, filename: str = ""):
        document_text_lower = document_text.lower()
        filename_lower = filename.lower()
        
        # Simple keyword-based classification, not gonna use text l
        classifications = {
            "medical": ["medical", "doctor", "hospital", "diagnosis", "treatment", "prescription", "patient"],
            "police_report": ["police", "incident", "report", "officer", "accident", "citation"],
            "insurance": ["insurance", "policy", "claim", "coverage", "premium", "insured"],
            "financial": ["invoice", "bill", "payment", "amount due", "receipt", "statement"],
            "legal": ["contract", "agreement", "court", "filing", "motion", "plaintiff", "defendant"],
            "correspondence": ["dear", "sincerely", "email", "letter", "correspondence"],
            "evidence": ["photo", "image", "video", "evidence", "exhibit"]
        }
        
        scores = {}
        for doc_type, keywords in classifications.items():
            score = sum(1 for keyword in keywords if keyword in document_text_lower or keyword in filename_lower)
            scores[doc_type] = score
        
        primary_type = max(scores, key=scores.get) if max(scores.values()) > 0 else "general"
        confidence = min(max(scores.values()) / 3, 1.0)
        
        return {
            "primary_type": primary_type,
            "confidence": confidence,
            "filename": filename,
            "suggested_category": primary_type.replace("_", " ").title()
        }
    
    def extract_key_information(self, document_text: str):
        date_pattern = r'\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b'
        dates = re.findall(date_pattern, document_text, re.IGNORECASE)
        amount_pattern = r'\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?'
        amounts = re.findall(amount_pattern, document_text)
        
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        emails = re.findall(email_pattern, document_text)
        
        phone_pattern = r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b|\(\d{3}\)\s*\d{3}[-.]?\d{4}'
        phones = re.findall(phone_pattern, document_text)
        
        return {
            "dates": dates[:10],  # Limit to first 10
            "amounts": amounts[:10],
            "emails": emails[:5],
            "phones": phones[:5],
            "extracted_count": {
                "dates": len(dates),
                "amounts": len(amounts),
                "contacts": len(emails) + len(phones)
            }
        }

    def process_file(self, file_path: str):
        if not os.path.exists(file_path):
            return {
                "success": False,
                "error": f"File not found: {file_path}",
                "file_type": "unknown"
            }
        
        file_ext = Path(file_path).suffix.lower()
        
        if file_ext == '.pdf':
            result = self.extract_text_from_pdf(file_path)
            result['file_type'] = 'pdf'
        elif file_ext in ['.jpg', '.jpeg', '.png', '.tiff', '.bmp']:
            result = self.extract_text_from_image(file_path)
            result['file_type'] = 'image'
        elif file_ext in ['.m4a', '.mp3', '.wav', '.flac']:
            result = self.extract_text_from_audio(file_path)
            result['file_type'] = 'audio'
        elif file_ext in ['.txt', '.csv', '.log']:
            result = self.process_text_file(file_path)
            result['file_type'] = 'text'
        else:
            return {
                "success": False,
                "error": f"Unsupported file type: {file_ext}",
                "file_type": "unsupported"
            }
        
        if result.get('success') and result.get('text'):
            result['classification'] = self.classify_document(result['text'], Path(file_path).name)
            result['key_info'] = self.extract_key_information(result['text'])
        
        return result
    
    def process_case_folder(self, folder_path: str):
        if not os.path.exists(folder_path):
            return {
                "success": False,
                "error": f"Folder not found: {folder_path}"
            }
        
        results = {
            "case_folder": folder_path,
            "case_name": Path(folder_path).name,
            "files_processed": [],
            "summary": {
                "total_files": 0,
                "successful": 0,
                "failed": 0,
                "by_type": {}
            }
        }
        
        for root, dirs, files in os.walk(folder_path):
            for filename in files:
                if filename.startswith('.') or filename == '.DS_Store':
                    continue
                
                file_path = os.path.join(root, filename)
                relative_path = os.path.relpath(file_path, folder_path)
                
                print(f"  Processing: {relative_path}")
                
                file_result = self.process_file(file_path)
                file_result['filename'] = filename
                file_result['relative_path'] = relative_path
                
                results['files_processed'].append(file_result)
                results['summary']['total_files'] += 1
                
                if file_result.get('success'):
                    results['summary']['successful'] += 1
                else:
                    results['summary']['failed'] += 1
                
                file_type = file_result.get('file_type', 'unknown')
                results['summary']['by_type'][file_type] = results['summary']['by_type'].get(file_type, 0) + 1
        
        return results

    async def process_document(self, input_data):
        print(f"\n{'='*60}")
        print("Document Agent Initialized")
        print(f"{'='*60}\n")

        APP_NAME = "saulgoodman"

        USER_ID = input_data['ID']['userid']
        SESSION_ID = input_data['ID']['sessionid']

        session_service = InMemorySessionService()
        await session_service.create_session(app_name=APP_NAME, user_id=USER_ID, session_id=SESSION_ID)

        # Create a conversation-only agent without tools to avoid function calling issues
        conversation_agent = Agent(
            name="docu_agent_conversation",
            model=MODEL_ID,
            description="Document analysis agent for case analysis conversations",
            instruction="""You are the Docu Agent, specializing in logical, evidence-based document analysis.
            
Focus on:
- Factual review of documents
- Evidence-based conclusions
- Document organization
- Key information extraction
- Objective analysis

Provide clear, logical analysis based on the information shared. Be concise and evidence-focused."""
        )

        runner = Runner(agent=conversation_agent, app_name=APP_NAME, session_service=session_service)
        content = types.Content(role='user', parts=[types.Part(text=input_data['message'])])
        events = runner.run(user_id=USER_ID, session_id=SESSION_ID, new_message=content)

        for event in events:
            if event.is_final_response():
                return event.content.parts[0].text
    
if __name__ == "__main__":
    agent = DocuAgent()
    print("\n" + "=" * 80)
    print("DOCU AGENT - COMPREHENSIVE CASE TESTING")
    print("=" * 80)
    
    test_data_path = "AI/data/test"
    cases = ['case_1', 'case_2', 'case_3', 'case_4']
    
    all_results = {}
    
    for case_name in cases:
        case_path = os.path.join(test_data_path, case_name)
        
        if not os.path.exists(case_path):
            print(f"\n⚠️  Skipping {case_name} - folder not found")
            continue
        
        print(f"\n{'='*80}")
        print(f"📁 PROCESSING {case_name.upper()}")
        print(f"{'='*80}")
        
        case_results = agent.process_case_folder(case_path)
        all_results[case_name] = case_results
        
        print(f"\n📊 SUMMARY FOR {case_name.upper()}:")
        print(f"  Total Files: {case_results['summary']['total_files']}")
        print(f"  ✅ Successful: {case_results['summary']['successful']}")
        print(f"  ❌ Failed: {case_results['summary']['failed']}")
        print(f"\n  Files by Type:")
        for file_type, count in case_results['summary']['by_type'].items():
            print(f"    - {file_type}: {count}")
        

        print(f"\n📄 DETAILED RESULTS:")
        for file_result in case_results['files_processed']:
            print(f"\n  File: {file_result['relative_path']}")
            print(f"  Type: {file_result.get('file_type', 'unknown')}")
            print(f"  Status: {'✅ Success' if file_result.get('success') else '❌ Failed'}")
            
            if file_result.get('success'):
                text = file_result.get('text', '')
                print(f"  Text Length: {len(text)} characters")
            
                if 'classification' in file_result:
                    classification = file_result['classification']
                    print(f"  Classification: {classification['primary_type']} (confidence: {classification['confidence']:.2f})")
            
                if 'key_info' in file_result:
                    key_info = file_result['key_info']
                    if key_info['dates']:
                        print(f"  Dates Found: {', '.join(key_info['dates'][:3])}")
                    if key_info['amounts']:
                        print(f"  Amounts Found: {', '.join(key_info['amounts'][:3])}")
                    if key_info['emails']:
                        print(f"  Emails Found: {', '.join(key_info['emails'][:2])}")
                
                if len(text) > 200:
                    print(f"  Preview: {text[:200]}...")
                elif len(text) > 0:
                    print(f"  Preview: {text[:200]}")
            else:
                print(f"  Error: {file_result.get('error', 'Unknown error')}")
    
    print(f"\n{'='*80}")
    print("🎯 OVERALL SUMMARY")
    print(f"{'='*80}")
    
    total_files = sum(r['summary']['total_files'] for r in all_results.values())
    total_successful = sum(r['summary']['successful'] for r in all_results.values())
    total_failed = sum(r['summary']['failed'] for r in all_results.values())
    
    print(f"\nCases Processed: {len(all_results)}")
    print(f"Total Files: {total_files}")
    print(f"✅ Successful: {total_successful}")
    print(f"❌ Failed: {total_failed}")
    print(f"Success Rate: {(total_successful/total_files*100):.1f}%")
    
    all_types = {}
    for case_results in all_results.values():
        for file_type, count in case_results['summary']['by_type'].items():
            all_types[file_type] = all_types.get(file_type, 0) + count
    
    print(f"\nFiles by Type Across All Cases:")
    for file_type, count in sorted(all_types.items()):
        print(f"  - {file_type}: {count}")
    
    output_file = "AI/data/out/docu_agent_test_results.json"
    with open(output_file, 'w') as f:
        json.dump(all_results, f, indent=2)
    
    print(f"\n💾 Full results saved to: {output_file}")
    print(f"\n{'='*80}")
    print("✨ TESTING COMPLETE")
    print(f"{'='*80}\n")
