import os
import asyncio
from typing import List, Dict, Any, Optional
from enum import Enum
from google import genai
from utils.file_converter import FileConverter
from utils.conversation_manager import ConversationManager
from agents.docu_agent.agent import DocuAgent
from agents.sherlock_agent.agent import SherlockAgent
from agents.client_coms_agent.agent import ClientCommunicationAgent


class AgentType(Enum):
    COMS = "client_coms"
    DOCU = "docu"
    SHERLOCK = "sherlock"
    ANALYSIS = "analysis"  # Triggers Doc + Sherlock conversation


class AIOrchestrator:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY")
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY environment variable or api_key parameter required")
        
        # Initialize Gemini client
        self.client = genai.Client(api_key=self.api_key)
        self.model_id = "gemini-2.5-flash"
        
        # Initialize utilities
        self.file_converter = FileConverter()
        self.conversation_manager = ConversationManager()
        
        # Initialize agents
        self.docu_agent = DocuAgent()
        self.sherlock_agent = SherlockAgent(docu_agent=self.docu_agent)
        self.coms_agent = ClientCommunicationAgent()
        
        # Define agent capabilities for intent classification
        self.agent_capabilities = {
            AgentType.COMS: [
                "email communication",
                "client messaging",
                "drafting responses",
                "communication setup",
                "sending messages",
                "formatting communications",
                "client correspondence"
            ],
            AgentType.ANALYSIS: [
                "data analysis",
                "document review",
                "case analysis",
                "finding insights",
                "comparing information",
                "generating ideas",
                "strategic thinking",
                "evidence evaluation",
                "pattern recognition"
            ]
        }
    
    def _build_intent_prompt(self, user_request: str, file_contents: List[Dict[str, str]]):
        files_summary = "\n".join([
            f"- {fc['filename']} ({fc['file_type']}): {fc['text'][:200]}..."
            for fc in file_contents
        ])
        
        prompt = f"""You are an AI agent router. Analyze the user's request and determine which agent should handle it.

User Request: {user_request}

Files Provided:
{files_summary}

Available Agents:
1. COMS Agent: Handles email communication, client messaging, drafting responses, setting up communications
2. ANALYSIS: Handles data analysis, document review, case analysis, generating ideas, strategic thinking (involves Doc and Sherlock agents working together)

Consider:
- If the user needs help with communications, emails, or messaging → COMS
- If the user needs help analyzing data, reviewing documents, or coming up with ideas → ANALYSIS

Respond with ONLY ONE WORD: either "COMS" or "ANALYSIS"
"""
        return prompt
    
    async def determine_agent(self, user_request: str, file_contents: List[Dict[str, str]]):
        prompt = self._build_intent_prompt(user_request, file_contents)
        
        try:
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=prompt
            )
            intent = response.text.strip().upper()
            
            if "COMS" in intent:
                return AgentType.COMS
            elif "ANALYSIS" in intent:
                return AgentType.ANALYSIS
            else:
                # Default to analysis if unclear
                return AgentType.ANALYSIS
                
        except Exception as e:
            print(f"Error determining intent: {e}")
            # Default to analysis
            return AgentType.ANALYSIS
    
    async def convert_files(self, file_urls: List[str]):
        file_contents = []
        
        for url in file_urls:
            try:
                result = self.file_converter.convert_to_text(url)
                file_contents.append(result)
            except Exception as e:
                print(f"Error converting {url}: {e}")
                file_contents.append({
                    "filename": url.split('/')[-1],
                    "file_type": "error",
                    "text": f"Error processing file: {str(e)}"
                })
        
        return file_contents
    
    async def run_analysis_conversation(self, user_request: str, file_contents: List[Dict[str, str]], max_iterations: int = 10):
        # Initialize conversation
        conversation_id = self.conversation_manager.create_conversation(
            agent1_name="docu",
            agent2_name="sherlock"
        )
        
        # Prepare file context
        files_context = "\n\n".join([
            f"=== {fc['filename']} ===\n{fc['text']}"
            for fc in file_contents
        ])
        
        # Initial prompt to Doc agent (using ADK interface)
        initial_prompt = f"""User Request: {user_request}

Files to analyze:
{files_context}

Please analyze these files and provide your logical, data-driven assessment."""
        
        # Start conversation with Doc agent
        doc_input = {
            "message": initial_prompt,
            "ID": {"userid": "orchestrator", "sessionid": conversation_id}
        }
        doc_response = await self.docu_agent.process_document(doc_input)
        
        self.conversation_manager.add_message(
            conversation_id,
            "docu",
            doc_response
        )
        
        current_speaker = "sherlock"
        
        # Run conversation loop
        for iteration in range(max_iterations):
            conversation_history = self.conversation_manager.get_conversation(conversation_id)
            
            if current_speaker == "sherlock":
                # Sherlock's turn
                sherlock_prompt = f"""User Request: {user_request}

Files context:
{files_context}

Docu Agent's analysis:
{doc_response}

Conversation so far:
{self._format_conversation_history(conversation_history)}

Please provide your creative, investigative perspective and try to find alternative explanations or insights."""
                
                sherlock_input = {
                    "message": sherlock_prompt,
                    "ID": {"userid": "orchestrator", "sessionid": conversation_id}
                }
                response = await self.sherlock_agent.analyze_case(sherlock_input)
                self.conversation_manager.add_message(conversation_id, "sherlock", response)
                current_speaker = "docu"
                
            else:
                # Doc's turn
                last_sherlock = conversation_history[-1]["content"]
                doc_prompt = f"""User Request: {user_request}

Sherlock's latest response:
{last_sherlock}

Conversation so far:
{self._format_conversation_history(conversation_history)}

Please respond with your logical analysis. If you've reached a consensus or have nothing new to add, indicate that."""
                
                doc_input = {
                    "message": doc_prompt,
                    "ID": {"userid": "orchestrator", "sessionid": conversation_id}
                }
                response = await self.docu_agent.process_document(doc_input)
                self.conversation_manager.add_message(conversation_id, "docu", response)
                current_speaker = "sherlock"
            
            # Check if agents have reached consensus
            if self._check_consensus(conversation_history):
                break
        
        # Get final conversation state
        final_conversation = self.conversation_manager.get_conversation(conversation_id)
        
        # Generate consensus summary
        consensus = await self._generate_consensus(user_request, final_conversation)
        
        # Generate actionable tasks
        tasks = await self._generate_actionable_tasks(user_request, {"consensus": consensus}, file_contents)
        
        return {
            "conversation_id": conversation_id,
            "iterations": len(final_conversation),
            "conversation": final_conversation,
            "consensus": consensus,
            "tasks": tasks
        }
    
    def _format_conversation_history(self, history: List[Dict[str, Any]]):
        formatted = []
        for msg in history:
            formatted.append(f"{msg['agent'].upper()}: {msg['content']}\n")
        return "\n".join(formatted)
    
    def _check_consensus(self, conversation_history: List[Dict[str, Any]]):
        if len(conversation_history) < 4:
            return False
        
        # Check last few messages for consensus keywords
        recent_messages = [msg['content'].lower() for msg in conversation_history[-3:]]
        consensus_keywords = [
            "agree", "consensus", "concluded", "final", 
            "nothing new", "settled", "aligned"
        ]
        
        return any(
            keyword in message 
            for message in recent_messages 
            for keyword in consensus_keywords
        )
    
    async def _generate_consensus(self, user_request: str, conversation: List[Dict[str, Any]]):
        conversation_text = self._format_conversation_history(conversation)
        
        prompt = f"""Based on the following conversation between Doc (logical analyst) and Sherlock (creative investigator), 
generate a comprehensive consensus summary that addresses the user's request.

User Request: {user_request}

Conversation:
{conversation_text}

Provide a clear, actionable summary that combines both perspectives."""
        
        response = self.client.models.generate_content(
            model=self.model_id,
            contents=prompt
        )
        return response.text
    
    async def _generate_actionable_tasks(self, user_request: str, analysis_result: Dict[str, Any], file_contents: List[Dict[str, str]]):
        """Generate specific actionable tasks based on the analysis"""
        
        # Build context from analysis
        context = f"""User Request: {user_request}

Analysis Summary: {analysis_result.get('consensus', '')}

Files Analyzed: {len(file_contents)} documents
"""
        
        prompt = f"""{context}

Based on this case analysis, generate 3-7 specific, actionable tasks that a legal assistant or paralegal should complete.

For each task, provide:
1. Title (brief, action-oriented)
2. Description (what needs to be done and why)
3. Priority (high, medium, or low)
4. Category (document, communication, research, deadline, or follow-up)
5. Estimated time (e.g., "30 minutes", "2-3 days")
6. Reasoning (why this task is important)

Format as JSON array:
[
  {{
    "title": "Request Medical Records",
    "description": "Obtain complete medical records from Dr. Smith to establish treatment timeline",
    "priority": "high",
    "category": "document",
    "estimatedTime": "2-3 days",
    "reasoning": "Medical records are critical for calculating damages and establishing causation"
  }}
]

Focus on tasks that are:
- Specific and actionable
- Time-sensitive or high-impact
- Within the scope of paralegal/legal assistant work
- Based on actual gaps or needs identified in the analysis

Return ONLY the JSON array, no other text."""

        try:
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=prompt
            )
            
            # Parse JSON response
            import json
            import re
            
            response_text = response.text.strip()
            # Extract JSON if wrapped in markdown code blocks
            json_match = re.search(r'```(?:json)?\s*(\[.*?\])\s*```', response_text, re.DOTALL)
            if json_match:
                response_text = json_match.group(1)
            
            tasks = json.loads(response_text)
            return tasks
        except Exception as e:
            print(f"Error generating tasks: {e}")
            # Return default tasks if generation fails
            return [
                {
                    "title": "Review Case Analysis",
                    "description": "Review the AI-generated analysis and verify key findings",
                    "priority": "high",
                    "category": "follow-up",
                    "estimatedTime": "30 minutes",
                    "reasoning": "Ensure AI analysis aligns with case facts"
                }
            ]
    
    async def process_request(self, user_request: str, file_urls: List[str], return_address: Optional[str] = None):
        print(f"🎭 Orchestrator: Processing request with {len(file_urls)} files")
        
        # Step 1: Convert files to text
        print("📄 Converting files to text...")
        file_contents = await self.convert_files(file_urls)
        print(f"✅ Converted {len(file_contents)} files")
        
        # Step 2: Determine which agent to use
        print("🤔 Determining appropriate agent...")
        agent_type = await self.determine_agent(user_request, file_contents)
        print(f"✅ Selected agent: {agent_type.value}")
        
        result = {
            "user_request": user_request,
            "files_processed": len(file_contents),
            "agent_type": agent_type.value,
            "file_contents": file_contents
        }
        
        # Step 3: Route to appropriate agent(s)
        if agent_type == AgentType.COMS:
            # Direct to communications agent
            print("📧 Routing to Communications Agent...")
            
            files_context = "\n\n".join([
                f"=== {fc['filename']} ===\n{fc['text']}"
                for fc in file_contents
            ])
            
            coms_prompt = f"""User Request: {user_request}

Files provided:
{files_context}

Please help with the communication task."""
            
            coms_input = {
                "message": coms_prompt,
                "ID": {"userid": "orchestrator", "sessionid": "coms_session"}
            }
            coms_response = await self.coms_agent.process_communication(coms_input)
            
            result["response"] = coms_response
            result["workflow"] = "API → Orchestrator → Com → Out"
            
        elif agent_type == AgentType.ANALYSIS:
            # Run Doc + Sherlock conversation
            print("🔍 Initiating analysis conversation between Doc and Sherlock...")
            
            analysis_result = await self.run_analysis_conversation(
                user_request,
                file_contents,
                max_iterations=10
            )
            
            # Send consensus to Coms agent for final formatting
            print("📧 Sending consensus to Communications Agent for formatting...")
            
            coms_prompt = f"""Please format this analysis for the client:

User's Original Request: {user_request}

Analysis Consensus:
{analysis_result['consensus']}

Create a clear, professional response."""
            
            coms_input = {
                "message": coms_prompt,
                "ID": {"userid": "orchestrator", "sessionid": "coms_format_session"}
            }
            final_response = await self.coms_agent.process_communication(coms_input)
            
            result["analysis"] = analysis_result
            result["response"] = final_response
            result["workflow"] = "API → Orchestrator → Doc → Sherlock → Com → Out"
        
        print("✅ Request processing complete!")
        return result


async def main():
    orchestrator = AIOrchestrator()
    
    file_urls = [
        "https://simplylaw.s3.us-east-1.amazonaws.com/POLICE+REPORT+(1).pdf",
        "https://simplylaw.s3.us-east-1.amazonaws.com/File+Notes.docx"
    ]
    
    result = await orchestrator.process_request(
        user_request="What are the key facts of this case and what strategy should we pursue?",
        file_urls=file_urls
    )
    
    print("\n" + "="*80)
    print("FINAL RESULT:")
    print("="*80)
    print(f"Agent Type: {result['agent_type']}")
    print(f"Workflow: {result['workflow']}")
    print(f"\nResponse:\n{result['response']}")


if __name__ == "__main__":
    asyncio.run(main())
