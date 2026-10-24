# AI Agent Integration Guide

## Overview

This guide explains how the AI agent system integrates with the frontend to automate legal workflows for legal assistants, paralegals, and case managers.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Case Detail Page                                         │  │
│  │  - AI Analysis Button                                     │  │
│  │  - Workflow Automation Card                               │  │
│  │  - AI Insights Tab                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTP
┌─────────────────────────────────────────────────────────────────┐
│              Next.js API Routes (/api/cases/[id]/analyze)       │
│  - Validates request                                            │
│  - Calls Python backend                                         │
│  - Stores results in database (ReasonChain)                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTP
┌─────────────────────────────────────────────────────────────────┐
│           Python FastAPI Server (port 8000)                     │
│  Endpoint: POST /api/orchestrator/analyze                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    AI Orchestrator                              │
│  1. Converts files to text                                      │
│  2. Determines agent type (COMS vs ANALYSIS)                    │
│  3. Routes to appropriate workflow                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
        ┌─────────────────────┴─────────────────────┐
        ↓                                           ↓
┌──────────────────┐                    ┌──────────────────────┐
│   COMS Agent     │                    │   ANALYSIS Workflow  │
│  - Email drafts  │                    │  ┌────────────────┐  │
│  - Communication │                    │  │  Docu Agent    │  │
│  - Formatting    │                    │  │  (Logical)     │  │
└──────────────────┘                    │  └────────────────┘  │
                                        │         ↕              │
                                        │  ┌────────────────┐  │
                                        │  │ Sherlock Agent │  │
                                        │  │ (Creative)     │  │
                                        │  └────────────────┘  │
                                        │         ↓              │
                                        │  Consensus Summary    │
                                        └──────────────────────┘
```

## Key Components

### 1. Frontend Components

#### **AIAnalysisDialog** (`/frontend/src/components/ai-analysis-dialog.tsx`)
- Modal dialog for initiating AI analysis
- File selection interface
- Suggested prompts for common tasks
- Real-time analysis results display

**Features:**
- Select multiple case files
- Pre-built prompt templates
- Streaming analysis results
- Confidence scores

#### **WorkflowAutomationCard** (`/frontend/src/components/workflow-automation-card.tsx`)
- Displays AI-recommended actions
- Checklist-style interface
- Priority-based organization
- Progress tracking

**Action Categories:**
- 📄 Document requests
- ✉️ Communications
- 🔍 Research tasks
- 📅 Deadline management
- 📞 Follow-ups

### 2. Backend API

#### **Analyze Endpoint** (`/frontend/src/app/api/cases/[id]/analyze/route.ts`)

**POST `/api/cases/[id]/analyze`**
```typescript
Request Body:
{
  userRequest: string,      // User's question/request
  fileUrls: string[]        // Array of file URLs to analyze
}

Response:
{
  success: boolean,
  analysis: {
    agent_type: string,     // "coms" or "analysis"
    workflow: string,       // Agent workflow used
    response: string,       // Final formatted response
    analysis: {             // Detailed analysis (if applicable)
      consensus: string,
      iterations: number,
      conversation: []
    }
  },
  reasonChainId: string     // Database record ID
}
```

**GET `/api/cases/[id]/analyze`**
- Retrieves past AI analyses for a case
- Returns array of ReasonChain records

### 3. Python Backend

#### **FastAPI Server** (`/AI/api_server.py`)

**Endpoint:** `POST /api/orchestrator/analyze`

```python
Request:
{
  "user_request": str,
  "file_urls": List[str],
  "return_address": Optional[str]
}

Response:
{
  "status": "success",
  "agent_type": str,
  "workflow": str,
  "response": str,
  "analysis": dict,
  "files_processed": int
}
```

#### **AI Orchestrator** (`/AI/agent_orchastrator.py`)

**Main Method:** `process_request(user_request, file_urls, return_address)`

**Workflow:**
1. **File Conversion** - Converts PDFs, images, audio to text
2. **Intent Classification** - Determines if request is COMS or ANALYSIS
3. **Agent Routing:**
   - **COMS:** Direct to ClientCommunicationAgent
   - **ANALYSIS:** Doc + Sherlock conversation → Consensus → COMS formatting

### 4. AI Agents

#### **DocuAgent** (`/AI/agents/docu_agent/agent.py`)
- **Role:** Logical, evidence-based analysis
- **Capabilities:**
  - OCR for images
  - PDF text extraction
  - Audio transcription
  - Document classification
  - Key information extraction

#### **SherlockAgent** (`/AI/agents/sherlock_agent/agent.py`)
- **Role:** Creative, investigative analysis
- **Capabilities:**
  - Timeline analysis
  - Inconsistency detection
  - Missing evidence identification
  - Damage calculation
  - Liability analysis
  - Settlement valuation
  - Legal issue identification

#### **ClientCommunicationAgent** (`/AI/agents/client_coms_agent/agent.py`)
- **Role:** Professional communication formatting
- **Capabilities:**
  - Email drafting
  - Letter formatting
  - Client-friendly language
  - Professional tone

## Use Cases for Legal Professionals

### 1. **Case Analysis & Strategy**
**Scenario:** New case intake with multiple documents

**Workflow:**
1. Upload police report, medical records, insurance docs
2. Click "AI Analysis" button
3. Select prompt: "Analyze this case and provide strategic recommendations"
4. Select all relevant files
5. Receive comprehensive analysis including:
   - Case strengths/weaknesses
   - Damage calculations
   - Settlement range
   - Missing evidence
   - Recommended next steps

**Value:** Saves 2-3 hours of manual document review

### 2. **Document Review & Summarization**
**Scenario:** Review lengthy medical records

**Workflow:**
1. Select medical record files
2. Prompt: "Summarize key medical findings and treatment timeline"
3. Get structured summary with:
   - Diagnosis
   - Treatment dates
   - Key medical providers
   - Dollar amounts
   - Critical dates

**Value:** Quickly understand complex medical documentation

### 3. **Demand Letter Preparation**
**Scenario:** Ready to send demand to insurance

**Workflow:**
1. Select all case documents
2. Prompt: "Draft a demand letter based on these documents"
3. Agents analyze case → Calculate damages → Draft professional letter
4. Review and customize the draft
5. Send via email integration

**Value:** Automated first draft saves 1-2 hours

### 4. **Missing Evidence Identification**
**Scenario:** Preparing for settlement negotiations

**Workflow:**
1. Select current case files
2. Prompt: "Identify any inconsistencies or missing evidence"
3. Receive checklist of:
   - Missing document types
   - Recommended evidence to gather
   - Inconsistencies to resolve
   - Priority requests

**Value:** Ensures case completeness before negotiations

### 5. **Client Communication**
**Scenario:** Need to update client on case status

**Workflow:**
1. Select recent documents/updates
2. Prompt: "Draft a client update email explaining the settlement offer"
3. Get client-friendly email with:
   - Clear explanation
   - Professional tone
   - Action items
   - Next steps

**Value:** Consistent, professional client communications

## Workflow Automation Features

### Automated Action Items

The system generates context-aware action items based on case analysis:

**High Priority Actions:**
- ⚠️ Request missing medical records
- ⚠️ Calendar statute of limitations
- ⚠️ Send demand letter
- ⚠️ Resolve document inconsistencies

**Medium Priority Actions:**
- 📋 Research similar case law
- 📋 Follow up with client
- 📋 Obtain expert witness quotes
- 📋 Prepare settlement analysis

**Low Priority Actions:**
- 📝 Organize case files
- 📝 Update case management system
- 📝 Schedule team review

### Progress Tracking

- Visual completion percentage
- Category-based organization
- Time estimates for each task
- Priority indicators
- Checklist interface

## Database Schema

### ReasonChain Table
Stores all AI interactions for transparency and auditability:

```prisma
model ReasonChain {
  id          String   @id @default(cuid())
  caseId      String
  agentType   String   // "orchestrator", "docu", "sherlock", "coms"
  action      String   // "AI Case Analysis"
  reasoning   String   // Full AI response
  status      String   // "pending", "approved", "rejected"
  impact      String   // "low", "medium", "high"
  data        Json?    // Full analysis data
  confidence  Float?   // 0.0 - 1.0
  timestamp   DateTime
}
```

## Setup Instructions

### Prerequisites
- Node.js 18+
- Python 3.9+
- PostgreSQL database
- Google API Key (for Gemini)

### 1. Backend Setup

```bash
cd AI

# Install Python dependencies
pip install -r requirements.txt

# Set environment variable
export GOOGLE_API_KEY='your-api-key-here'

# Start FastAPI server
python api_server.py
```

Server runs on `http://localhost:8000`

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Set environment variables
echo "PYTHON_BACKEND_URL=http://localhost:8000" >> .env.local
echo "DATABASE_URL=your-postgres-url" >> .env.local

# Run database migrations
npx prisma migrate dev

# Start Next.js dev server
npm run dev
```

Frontend runs on `http://localhost:3000`

### 3. Test the Integration

1. Navigate to a case detail page
2. Click "AI Analysis" button
3. Select files and enter a prompt
4. View results in "AI Insights" tab

## Environment Variables

### Frontend (.env.local)
```env
DATABASE_URL=postgresql://...
PYTHON_BACKEND_URL=http://localhost:8000
```

### Backend (.env)
```env
GOOGLE_API_KEY=your-gemini-api-key
```

## API Testing

### Test with cURL

```bash
# Test orchestrator endpoint
curl -X POST http://localhost:8000/api/orchestrator/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "user_request": "Analyze this case",
    "file_urls": [
      "https://example.com/police-report.pdf",
      "https://example.com/medical-records.pdf"
    ]
  }'
```

### Test Scenarios Available

```bash
# Get pre-built test scenarios
curl http://localhost:8000/api/test/scenarios
```

## Monitoring & Debugging

### FastAPI Logs
- Server logs show orchestrator workflow
- Agent interactions are logged
- File conversion status tracked

### Database Queries
```sql
-- View all AI analyses for a case
SELECT * FROM "ReasonChain" 
WHERE "caseId" = 'case-id-here' 
ORDER BY timestamp DESC;

-- View high-confidence insights
SELECT * FROM "ReasonChain" 
WHERE confidence > 0.8 
ORDER BY timestamp DESC;
```

### Frontend DevTools
- Network tab shows API calls
- Console logs analysis results
- React DevTools for component state

## Performance Considerations

### File Processing
- Large PDFs may take 10-30 seconds
- Multiple files processed in parallel
- OCR for images adds 5-10 seconds per image

### Agent Conversations
- Doc + Sherlock conversations: 30-60 seconds
- Max 10 iterations (configurable)
- Consensus detection stops early when possible

### Optimization Tips
1. Pre-process frequently accessed files
2. Cache file conversions
3. Use background tasks for long analyses
4. Implement result caching

## Security & Privacy

### Data Handling
- Files processed via secure URLs
- No files stored on AI servers
- Text extracted and processed in memory
- Results stored in secure database

### API Security
- CORS configured for frontend domain
- Rate limiting recommended for production
- API key validation required
- Database access controlled via Prisma

### HIPAA Compliance Considerations
- Ensure Google API terms allow medical data
- Consider on-premise LLM alternatives
- Implement audit logging
- Encrypt data at rest and in transit

## Troubleshooting

### "Orchestrator not initialized"
- Check GOOGLE_API_KEY is set
- Restart FastAPI server
- Verify API key is valid

### "Failed to analyze case"
- Check Python backend is running
- Verify PYTHON_BACKEND_URL in frontend
- Check file URLs are accessible
- Review FastAPI logs for errors

### Files not processing
- Verify file URLs are publicly accessible
- Check file format is supported
- Review file converter logs
- Test with sample files first

### No AI insights showing
- Check ReasonChain records in database
- Verify agentType filter includes orchestrator
- Refresh case detail page
- Check browser console for errors

## Future Enhancements

### Planned Features
1. **Real-time Streaming** - Stream AI responses as they generate
2. **Custom Workflows** - User-defined agent workflows
3. **Batch Processing** - Analyze multiple cases at once
4. **Integration Hub** - Connect to practice management systems
5. **Voice Input** - Dictate analysis requests
6. **Mobile App** - iOS/Android support
7. **Advanced Analytics** - Case outcome predictions
8. **Template Library** - Pre-built analysis templates

### Agent Improvements
1. **Negotiation Agent** - Settlement negotiation strategies
2. **Discovery Agent** - Discovery request generation
3. **Deposition Agent** - Deposition question preparation
4. **Trial Agent** - Trial strategy and preparation

## Support & Resources

### Documentation
- FastAPI Docs: `http://localhost:8000/docs`
- API Reference: `http://localhost:8000/redoc`
- Component Storybook: (coming soon)

### Example Prompts

**Case Analysis:**
- "What are the key facts and timeline of this case?"
- "Analyze liability and calculate potential damages"
- "Identify strengths and weaknesses of this case"

**Document Review:**
- "Summarize these medical records"
- "Extract all dollar amounts and dates from these documents"
- "Classify these documents by type"

**Communication:**
- "Draft a demand letter based on this analysis"
- "Write a client update email about the settlement offer"
- "Create a professional response to this insurance letter"

**Strategy:**
- "What evidence is missing from this case?"
- "Recommend next steps for case development"
- "Evaluate settlement value and negotiation strategy"

## Contributing

To extend the AI integration:

1. **Add New Agent:**
   - Create agent in `/AI/agents/your_agent/`
   - Implement ADK Agent interface
   - Register in orchestrator

2. **Add New Workflow:**
   - Define in `agent_orchastrator.py`
   - Add intent classification logic
   - Update API response format

3. **Add Frontend Feature:**
   - Create component in `/frontend/src/components/`
   - Add to case detail page
   - Update API integration

## License & Credits

Built with:
- Google Gemini AI (via ADK)
- FastAPI
- Next.js 14
- Prisma ORM
- shadcn/ui components

---

**Questions?** Check the FastAPI docs at `http://localhost:8000/docs` or review the agent code in `/AI/agents/`
