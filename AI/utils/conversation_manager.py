import json
import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime


class ConversationManager:
    def __init__(self, max_iterations: int = 10):
        self.max_iterations = max_iterations
        self.conversations: Dict[str, Dict[str, Any]] = {}
    
    def create_conversation(self, agent1_name: str, agent2_name: str) -> str:
        conversation_id = str(uuid.uuid4())
        self.conversations[conversation_id] = {
            "id": conversation_id,
            "agent1": agent1_name,
            "agent2": agent2_name,
            "messages": [],
            "created_at": datetime.now().isoformat(),
            "consensus_reached": False,
            "iteration_count": 0
        }
        return conversation_id
    
    def add_message(self, conversation_id: str, agent_name: str, content: str, metadata: Optional[Dict] = None):
        if conversation_id not in self.conversations:
            raise ValueError(f"Conversation {conversation_id} not found")
        
        message = {
            "agent": agent_name,
            "content": content,
            "timestamp": datetime.now().isoformat(),
            "metadata": metadata or {}
        }
        
        self.conversations[conversation_id]["messages"].append(message)
        self.conversations[conversation_id]["iteration_count"] += 1
    
    def get_conversation(self, conversation_id: str) -> List[Dict[str, Any]]:
        if conversation_id not in self.conversations:
            raise ValueError(f"Conversation {conversation_id} not found")
        
        return self.conversations[conversation_id]["messages"]
    
    # Keep old interface for backward compatibility
    def __init__(self, max_iterations: int = 10):
        self.max_iterations = max_iterations
        self.conversations: Dict[str, Dict[str, Any]] = {}
        # Legacy single conversation support
        self.conversation_history: List[Dict[str, Any]] = []
        self.consensus_reached = False
        self.iteration_count = 0

    def add_turn(self, agent_name: str, message: str, analysis: Optional[Dict] = None, metadata: Optional[Dict] = None):

        turn = {
            "iteration": self.iteration_count,
            "agent": agent_name,
            "message": message,
            "timestamp": datetime.now().isoformat(),
            "analysis": analysis or {},
            "metadata": metadata or {}
        }
        
        self.conversation_history.append(turn)
        self.iteration_count += 1
        
        # Check for consensus after each turn
        if self.iteration_count > 2:  # Need at least 3 turns to detect consensus
            self._check_consensus()
    
    def _check_consensus(self):
        if len(self.conversation_history) < 3:
            return False
        
        # Get last few messages
        recent_messages = self.conversation_history[-3:]
        
        # Simple consensus detection: look for agreement keywords
        agreement_keywords = [
            'agree', 'consensus', 'aligned', 'concur', 
            'same conclusion', 'consistent', 'confirmed'
        ]
        
        agreement_count = 0
        for turn in recent_messages:
            message_lower = turn['message'].lower()
            if any(keyword in message_lower for keyword in agreement_keywords):
                agreement_count += 1
        
        # If 2 out of 3 recent messages show agreement
        if agreement_count >= 2:
            self.consensus_reached = True
            return True
        
        return False
    
    def should_continue(self) -> bool:
        if self.consensus_reached:
            return False
        
        if self.iteration_count >= self.max_iterations:
            return False
        
        return True
    
    def generate_consensus_summary(self) -> Dict[str, Any]:
        if not self.conversation_history:
            return {
                "status": "error",
                "message": "No conversation history to summarize"
            }
        
        # Separate turns by agent
        doc_turns = [t for t in self.conversation_history if t['agent'] == 'doc_agent']
        sherlock_turns = [t for t in self.conversation_history if t['agent'] == 'sherlock_agent']
        
        # Extract key points from each agent
        doc_key_points = self._extract_key_points(doc_turns)
        sherlock_key_points = self._extract_key_points(sherlock_turns)
        
        # Identify areas of agreement
        agreement_areas = self._find_agreement_areas(doc_turns, sherlock_turns)
        
        # Identify areas of debate
        debate_areas = self._find_debate_areas(doc_turns, sherlock_turns)
        
        consensus = {
            "status": "success",
            "consensus_reached": self.consensus_reached,
            "total_iterations": self.iteration_count,
            "conversation_summary": {
                "doc_agent_perspective": {
                    "approach": "Logical, evidence-based analysis",
                    "key_points": doc_key_points,
                    "final_position": doc_turns[-1]['message'] if doc_turns else ""
                },
                "sherlock_agent_perspective": {
                    "approach": "Strategic, pattern-based analysis",
                    "key_points": sherlock_key_points,
                    "final_position": sherlock_turns[-1]['message'] if sherlock_turns else ""
                }
            },
            "areas_of_agreement": agreement_areas,
            "areas_of_debate": debate_areas,
            "unified_recommendation": self._generate_unified_recommendation(
                doc_turns, sherlock_turns
            ),
            "confidence_level": self._calculate_confidence(),
            "timestamp": datetime.now().isoformat()
        }
        
        return consensus
    
    def _extract_key_points(self, turns: List[Dict]) -> List[str]:
        key_points = []
        
        for turn in turns:
            # In a real implementation, this would use NLP to extract key points
            # For now, we'll just take the first sentence of each message
            message = turn['message']
            if message:
                # Split by period and take first sentence
                sentences = message.split('.')
                if sentences and sentences[0]:
                    key_points.append(sentences[0].strip())
        
        return key_points[:5]  # Limit to top 5 points
    
    def _find_agreement_areas(self, doc_turns: List[Dict], sherlock_turns: List[Dict]):
        agreements = []
        
        # Simple keyword matching for demonstration
        # In production, use semantic similarity
        common_themes = [
            "evidence", "timeline", "damages", "liability", 
            "settlement", "strategy", "risk"
        ]
        
        for theme in common_themes:
            doc_mentions = sum(1 for t in doc_turns if theme in t['message'].lower())
            sherlock_mentions = sum(1 for t in sherlock_turns if theme in t['message'].lower())
            
            if doc_mentions > 0 and sherlock_mentions > 0:
                agreements.append(f"Both agents emphasize {theme}")
        
        return agreements[:5]
    
    def _find_debate_areas(self, doc_turns: List[Dict], sherlock_turns: List[Dict]):
        debates = []
        
        disagreement_keywords = [
            'however', 'but', 'disagree', 'alternatively', 
            'on the other hand', 'different perspective'
        ]
        
        for turn in doc_turns + sherlock_turns:
            message_lower = turn['message'].lower()
            for keyword in disagreement_keywords:
                if keyword in message_lower:

                    debates.append(f"{turn['agent']} raised alternative view")
                    break
        
        return debates[:3]
    
    def _generate_unified_recommendation(self, doc_turns: List[Dict], sherlock_turns: List[Dict]):
        
        if not doc_turns or not sherlock_turns:
            return "Insufficient data for unified recommendation"
        
        doc_final = doc_turns[-1]['message']
        sherlock_final = sherlock_turns[-1]['message']
        
        recommendation = f"""
UNIFIED RECOMMENDATION:

After {self.iteration_count} iterations of collaborative analysis, combining 
logical evidence-based review with strategic pattern recognition:

DOC AGENT (Logical Perspective):
{doc_final[:200]}...

SHERLOCK AGENT (Strategic Perspective):  
{sherlock_final[:200]}...

CONSENSUS:
Both analytical approaches converge on a comprehensive strategy that balances
factual evidence with strategic considerations. The recommendation synthesizes
rigorous data analysis with creative problem-solving to provide the most
effective path forward.

Confidence Level: {self._calculate_confidence()}
"""
        
        return recommendation.strip()
    
    def _calculate_confidence(self):
        
        if self.consensus_reached and self.iteration_count >= 5:
            return "High"
        elif self.consensus_reached or self.iteration_count >= 7:
            return "Medium"
        else:
            return "Low"
    
    def get_conversation_history(self):
        return self.conversation_history
    
    def export_conversation(self, filepath: str):
        export_data = {
            "metadata": {
                "max_iterations": self.max_iterations,
                "total_iterations": self.iteration_count,
                "consensus_reached": self.consensus_reached,
                "timestamp": datetime.now().isoformat()
            },
            "conversation_history": self.conversation_history,
            "consensus_summary": self.generate_consensus_summary()
        }
        
        with open(filepath, 'w') as f:
            json.dump(export_data, f, indent=2)
        
        print(f"💾 Conversation exported to: {filepath}")
    
    def __repr__(self):
        return (
            f"ConversationManager("
            f"iterations={self.iteration_count}/{self.max_iterations}, "
            f"consensus={self.consensus_reached})"
        )


if __name__ == "__main__":
    # Create conversation manager
    manager = ConversationManager(max_iterations=10)
    
    # Simulate a conversation
    print("🎭 SIMULATING AGENT CONVERSATION\n")
    
    # Turn 1: Doc Agent
    manager.add_turn(
        agent_name="doc_agent",
        message="Based on the documents, I see evidence of clear liability. Medical bills total $45,000 and wage loss is $12,000.",
        analysis={"total_damages": 57000, "liability": "clear"}
    )
    print(f"Turn {manager.iteration_count}: Doc Agent analyzed documents")
    
    # Turn 2: Sherlock Agent
    manager.add_turn(
        agent_name="sherlock_agent",
        message="I agree with the liability assessment. However, I see patterns suggesting additional damages. The injury timeline indicates future medical treatment is likely.",
        analysis={"projected_damages": 85000, "future_treatment": True}
    )
    print(f"Turn {manager.iteration_count}: Sherlock Agent added strategic insights")
    
    # Turn 3: Doc Agent
    manager.add_turn(
        agent_name="doc_agent",
        message="Good point about future damages. The medical records do indicate ongoing treatment. However, we should be conservative in our projections.",
        analysis={"adjusted_damages": 70000}
    )
    print(f"Turn {manager.iteration_count}: Doc Agent adjusted analysis")
    
    # Turn 4: Sherlock Agent
    manager.add_turn(
        agent_name="sherlock_agent",
        message="I concur with the conservative approach. Let's align on $70,000 in damages with a settlement range of $50-65k. This consensus balances our perspectives.",
        analysis={"settlement_range": [50000, 65000]}
    )
    print(f"Turn {manager.iteration_count}: Sherlock Agent reached consensus")
    
    # Generate consensus
    print(f"\n{'='*60}")
    print("CONSENSUS ANALYSIS")
    print(f"{'='*60}\n")
    
    consensus = manager.generate_consensus_summary()
    print(json.dumps(consensus, indent=2))
    
    # Export conversation
    manager.export_conversation("/tmp/agent_conversation.json")
    
    print(f"\n{manager}")
