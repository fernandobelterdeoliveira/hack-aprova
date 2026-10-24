# AI Agents Architecture Design

## Overview
This document describes the multi-agent architecture for LexiLoop, a legal case processing system that uses specialized AI agents to handle document processing, analysis, and client communication.

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         INPUT LAYER                              │
│  Files: PDF, Audio, Images, Text, etc.                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CONVERSION LAYER                              │
│  Convert all inputs to text format                               │
│  - PDF → Text extraction                                         │
│  - Audio → Speech-to-text                                        │
│  - Images → OCR                                                  │
│  - Text → Direct pass-through                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AI ORCHESTRATOR (Gemini)                       │
│                                                                   │
│  Analyzes request and routes to appropriate agent:               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ IF: Email setup, client communications → CLIENT_COMS_AGENT │ │
│  │ IF: Data analysis, document processing → DOC_AGENT         │ │
│  │ IF: Ideas, strategy, investigations → COLLABORATIVE_MODE   │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
                ▼            ▼            ▼
┌──────────────────┐  ┌──────────────┐  ┌──────────────────────┐
│  CLIENT_COMS     │  │   DOC_AGENT  │  │ COLLABORATIVE MODE   │
│     AGENT        │  │              │  │  (Doc + Sherlock)    │
│                  │  │ - Process    │  │                      │
│ - Draft emails   │  │   documents  │  │ ┌─────────────────┐  │
│ - Handle comms   │  │ - Extract    │  │ │   DOC_AGENT     │  │
│ - Direct output  │  │   text       │  │ │   (Logical)     │  │
│   to client      │  │ - Classify   │  │ │                 │  │
└────────┬─────────┘  │ - Extract    │  │ │ Analyzes files  │  │
         │            │   key info   │  │ │ Sticks to logic │  │
         │            └──────┬───────┘  │ │ Forms opinions  │  │
         │                   │          │ └────────┬────────┘  │
         │                   │          │          │           │
         │                   ▼          │          ▼           │
         │            ┌──────────────┐  │ ┌─────────────────┐  │
         │            │ Direct       │  │ │ SHERLOCK_AGENT  │  │
         │            │ Analysis     │  │ │ (Creative)      │  │
         │            │ Output       │  │ │                 │  │
         │            └──────────────┘  │ │ Finds patterns  │  │
         │                              │ │ Creative ideas  │  │
         │                              │ │ Explains data   │  │
         │                              │ └────────┬────────┘  │
         │                              │          │           │
         │                              │          ▼           │
         │                              │ ┌─────────────────┐  │
         │                              │ │  CONVERSATION   │  │
         │                              │ │  (Max 10 iters) │  │
         │                              │ │                 │  │
         │                              │ │ Doc & Sherlock  │  │
         │                              │ │ debate & reach  │  │
         │                              │ │ consensus       │  │
         │                              │ └────────┬────────┘  │
         │                              │          │           │
         │                              │          ▼           │
         │                              │ ┌─────────────────┐  │
         │                              │ │ CONSENSUS       │  │
         │                              │ │ SUMMARY         │  │
         │                              │ └────────┬────────┘  │
         │                              └──────────┼───────────┘
         │                                         │
         │                                         ▼
         │                              ┌─────────────────────┐
         │                              │  CLIENT_COMS_AGENT  │
         │                              │                     │
         │                              │ Formats consensus   │
         │                              │ into client-        │
         │                              │ friendly message    │
         │                              └──────────┬──────────┘
         │                                         │
         └─────────────────┬───────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        OUTPUT LAYER                              │
│                                                                   │
│  Return to client via API response                               │
│  - Formatted message                                             │
│  - Analysis results                                              │
│  - Recommendations                                               │
└─────────────────────────────────────────────────────────────────┘
```

## Agent Responsibilities

### 1. **AI Orchestrator (Gemini 2.5 Flash)**
- **Role**: Router and traffic controller
- **Responsibilities**:
  - Receives all incoming requests
  - Analyzes user intent
  - Routes to appropriate agent(s)
  - Manages agent-to-agent communication
  - Aggregates final responses

### 2. **Doc Agent (Document Processor)**
- **Role**: Logical analyst
- **Responsibilities**:
  - Process and extract text from all file types
  - Classify documents
  - Extract key information (dates, amounts, names)
  - Stick to facts and data
  - Form objective opinions based on evidence
  - In collaborative mode: Represent logical, data-driven perspective

### 3. **Sherlock Agent (Strategic Analyst)**
- **Role**: Creative investigator
- **Responsibilities**:
  - Find patterns and connections
  - Think creatively about case strategy
  - Explain implications of data
  - Develop theories and ideas
  - In collaborative mode: Represent creative, strategic perspective

### 4. **Client Coms Agent (Communication Handler)**
- **Role**: Client interface
- **Responsibilities**:
  - Draft client communications
  - Format responses appropriately
  - Handle direct client-facing tasks (emails, texts)
  - Translate technical/legal language to plain English
  - Final step before output to client

## Workflow Patterns

### Pattern 1: Direct Communication (Coms Agent Only)
```
API → Orchestrator → Coms Agent → Output
```
**Use Cases**:
- Email drafting
- Text message composition
- General client communication

### Pattern 2: Document Analysis (Doc Agent Only)
```
API → Orchestrator → Doc Agent → Output
```
**Use Cases**:
- Document classification
- Text extraction
- Basic information retrieval

### Pattern 3: Strategic Analysis (Collaborative Mode)
```
API → Orchestrator → Doc Agent → Sherlock Agent ⟷ (10 iterations) → Coms Agent → Output
```
**Use Cases**:
- Case strategy development
- Complex analysis requiring multiple perspectives
- Creative problem-solving
- Idea generation

## Collaborative Mode Details

When the orchestrator determines a request needs creative analysis:

1. **Doc Agent** processes files and forms logical analysis
2. **Sherlock Agent** receives Doc's analysis and adds creative interpretation
3. **Conversation Loop** (max 10 iterations):
   - Doc presents evidence-based arguments
   - Sherlock presents strategic insights
   - They debate, challenge, and refine ideas
   - Loop continues until:
     - Consensus reached
     - 10 iterations completed
     - Clear answer emerges
4. **Consensus Summary** is generated
5. **Coms Agent** formats for client delivery

## Implementation Status

### ✅ Completed
- [x] Doc Agent with file processing capabilities
- [x] Sherlock Agent with analytical tools
- [x] Client Coms Agent with multi-channel support
- [x] Agent-to-Agent communication (Doc ⟷ Sherlock)
- [x] AI Orchestrator routing logic with Gemini
- [x] Collaborative conversation loop (Doc ⟷ Sherlock, max 10 iterations)
- [x] File Converter utility (PDF, audio, image, text, DOCX)
- [x] Conversation Manager with consensus detection
- [x] FastAPI server with complete endpoints
- [x] Comprehensive test cases
- [x] Final integration with Coms Agent

### 🎉 Implementation Complete
The entire AI agent system is now fully implemented and operational!

## Technology Stack

- **AI Model**: Google Gemini 2.5 Flash (via ADK)
- **Language**: Python 3.x
- **Document Processing**: PyPDF2, pytesseract, OpenCV
- **Speech Recognition**: speech_recognition, pydub
- **API**: FastAPI
- **Database**: Prisma + PostgreSQL
- **Frontend**: Next.js + TypeScript

## File Structure

```
AI/
├── agent_orchastrator.py      # Main orchestrator with Gemini routing ✅
├── api_server.py              # FastAPI server with endpoints ✅
├── test_cases.py              # Comprehensive test suite ✅
├── requirements.txt           # Python dependencies
├── agents/
│   ├── client_coms_agent/
│   │   └── agent.py           # Client communication handler ✅
│   ├── docu_agent/
│   │   └── agent.py           # Document processor ✅
│   └── sherlock_agent/
│       └── agent.py           # Strategic analyst ✅
├── utils/
│   ├── conversation_manager.py # Agent conversation management ✅
│   ├── file_converter.py      # Multi-format file conversion ✅
│   └── database.py            # Database utilities
└── data/
    ├── live/                  # Production data
    └── test/                  # Test cases
        ├── case_1/
        ├── case_2/
        ├── case_3/
        └── case_4/
```

## API Integration

The orchestrator is exposed via FastAPI with the following endpoints:

### Core Endpoints

#### `POST /api/process`
Process files through the agent pipeline
```json
{
  "user_request": "Analyze this case and provide recommendations",
  "file_urls": [
    "https://simplylaw.s3.us-east-1.amazonaws.com/POLICE+REPORT.pdf",
    "https://simplylaw.s3.us-east-1.amazonaws.com/File+Notes.docx"
  ],
  "return_address": "attorney@lawfirm.com"
}
```

Response:
```json
{
  "task_id": "task_20250125_123456_0",
  "status": "processing",
  "message": "Task created. Processing 2 files."
}
```

#### `GET /api/tasks/{task_id}`
Check status of a processing task
```json
{
  "task_id": "task_20250125_123456_0",
  "status": "completed",
  "result": {
    "agent_type": "analysis",
    "workflow": "API → Orchestrator → Doc → Sherlock → Com → Out",
    "response": "...",
    "analysis": { ... }
  }
}
```

#### `POST /api/convert`
Convert files to text without agent processing
```json
{
  "file_urls": ["https://example.com/document.pdf"]
}
```

#### `GET /api/test/file-urls`
Get example file URLs for testing

#### `GET /api/test/scenarios`
Get pre-configured test scenarios

### Next.js Integration

The FastAPI server can be integrated with Next.js API routes:

```typescript
// frontend/src/app/api/process/route.ts
export async function POST(request: Request) {
  const body = await request.json();
  
  const response = await fetch('http://localhost:8000/api/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  return Response.json(await response.json());
}
```

## Quick Start

### Installation

1. **Install Python dependencies**:
```bash
cd AI
pip install -r requirements.txt
```

2. **Set up environment variables**:
```bash
export GOOGLE_API_KEY='your-gemini-api-key'
```

3. **Install system dependencies** (for file conversion):
```bash
# macOS
brew install tesseract ffmpeg

# Ubuntu/Debian
sudo apt-get install tesseract-ocr ffmpeg
```

### Running the System

#### Start the API Server
```bash
cd AI
python api_server.py
```

The server will start on `http://localhost:8000`
- API Documentation: `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/health`

#### Run Test Cases
```bash
# Run all tests
python test_cases.py all

# Run quick test (single case)
python test_cases.py quick

# Run communication tests only
python test_cases.py communication

# Run analysis tests only
python test_cases.py analysis
```

#### Use the Orchestrator Programmatically
```python
from agent_orchastrator import AIOrchestrator
import asyncio

async def main():
    orchestrator = AIOrchestrator()
    
    result = await orchestrator.process_request(
        user_request="Analyze this case",
        file_urls=[
            "https://simplylaw.s3.us-east-1.amazonaws.com/POLICE+REPORT.pdf"
        ]
    )
    
    print(result['response'])

asyncio.run(main())
```

### Example Workflows

#### Example 1: Email Communication
```python
result = await orchestrator.process_request(
    user_request="Draft an email to the client about settlement",
    file_urls=["https://example.com/offer.pdf"]
)
# Routes to: Orchestrator → Coms Agent → Out
```

#### Example 2: Case Analysis
```python
result = await orchestrator.process_request(
    user_request="Analyze these documents and provide strategy",
    file_urls=[
        "https://example.com/police_report.pdf",
        "https://example.com/medical_records.pdf",
        "https://example.com/call.m4a"
    ]
)
# Routes to: Orchestrator → Doc → Sherlock (conversation) → Coms → Out
```

## Testing

### Test Coverage

The test suite includes 8 comprehensive test cases:

1. **Email Communication Setup** - Tests Coms Agent routing
2. **Case Document Analysis** - Tests Doc + Sherlock collaboration
3. **Insurance Policy Analysis** - Tests multi-document analysis
4. **Property Damage Assessment** - Tests estimate and photo processing
5. **Audio Transcription and Analysis** - Tests audio file handling
6. **Medical Lien Analysis** - Tests strategic lien negotiation
7. **Mixed Media Comprehensive Analysis** - Tests all file types together
8. **Client Status Update** - Tests Coms Agent formatting

### Running Tests

```bash
# All tests
python test_cases.py all

# Specific test category
python test_cases.py communication
python test_cases.py analysis

# Quick smoke test
python test_cases.py quick
```

### Expected Test Results

- **Agent Routing**: Validates correct agent selection based on intent
- **Workflow**: Confirms proper agent pipeline execution
- **File Conversion**: Verifies all file types convert to text
- **Conversation**: Tests Doc-Sherlock dialogue reaches consensus
- **Output Quality**: Checks response formatting and completeness

## Security & Privacy

- All file processing happens server-side
- Client data never stored permanently without consent
- Agent conversations logged for quality assurance
- HIPAA-compliant document handling
- Encrypted communication between agents

## Performance Considerations

- **Doc Agent**: ~2-5 seconds per document
- **Sherlock Analysis**: ~10-30 seconds for full case
- **Collaborative Mode**: ~30-90 seconds (depends on complexity)
- **Coms Agent**: ~1-3 seconds for formatting

## Error Handling

Each agent includes:
- Graceful error recovery
- Fallback to simpler processing
- Error logging and tracking
- User-friendly error messages via Coms Agent
