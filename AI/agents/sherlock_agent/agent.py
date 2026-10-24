import os
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from dotenv import load_dotenv
from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from google.adk.tools import google_search
import pytesseract
import cv2
import asyncio
import re
import json
from AI.agents.docu_agent import DocuAgent
from datetime import datetime
from typing import Dict, List, Any, Optional

load_dotenv(".env")

MODEL_ID = "gemini-2.5-flash"

class SherlockAgent:
    def __init__(self, docu_agent: Optional['DocuAgent'] = None):
        self.API_KEY = os.getenv("GOOGLE_API_KEY")
        if not self.API_KEY:
            raise ValueError("GOOGLE_API_KEY environment variable not set.")
        
        self.docu_agent_name = "docu_agent"
        self.docu_agent = docu_agent
        self.case_data = None  # Store case data received from DocuAgent
        
        self.agent = Agent(
            name="sherlock_agent",
            model=MODEL_ID,
            description="Advanced analytical agent that investigates case data, identifies patterns, finds inconsistencies, and helps attorneys develop legal strategies and solutions. Can request document processing from DocuAgent.",
            instruction=self.get_instruction(),
            tools=[
                google_search,
                self.request_document_processing,
                self.analyze_case_timeline,
                self.identify_inconsistencies,
                self.find_missing_evidence,
                self.calculate_damages,
                self.generate_case_strategy,
                self.cross_reference_documents,
                self.analyze_liability,
                self.evaluate_settlement_value,
                self.identify_legal_issues,
                self.recommend_next_steps,
            ]
        )
    
    def get_instruction(self):
        return """You are the Sherlock Agent for LexiLoop, the analytical investigator and strategic advisor.

Your core mission is to help attorneys and paralegals develop winning case strategies by:

0. DOCUMENT PROCESSING (if needed)
   - If you don't have case data yet, use request_document_processing tool to get it from DocuAgent
   - DocuAgent will process all documents in the case folder and return structured data
   - Wait for the processed case data before performing analysis

1. COMPREHENSIVE ANALYSIS
   - Scan all case documents processed by the Doc Agent
   - Build complete timelines of events
   - Identify all parties, witnesses, and entities involved
   - Map relationships and connections between evidence

2. PATTERN RECOGNITION & INCONSISTENCIES
   - Find contradictions in witness statements, reports, or documentation
   - Identify patterns that strengthen or weaken the case
   - Spot red flags or suspicious information
   - Detect missing or altered documentation

3. EVIDENCE EVALUATION
   - Assess strength and admissibility of evidence
   - Identify gaps in documentation or proof
   - Recommend additional evidence to collect
   - Prioritize most compelling evidence

4. DAMAGE CALCULATION
   - Calculate medical expenses, lost wages, property damage
   - Project future damages and losses
   - Identify all compensable harm categories
   - Build comprehensive damage reports

5. LIABILITY ANALYSIS
   - Evaluate fault and causation
   - Identify potential defendants and their liability percentages
   - Assess comparative/contributory negligence
   - Find applicable laws, statutes, and precedents

6. STRATEGIC RECOMMENDATIONS
   - Suggest negotiation strategies and settlement ranges
   - Recommend legal arguments and theories
   - Identify weaknesses to address proactively
   - Propose case development action items

7. LEGAL RESEARCH INTEGRATION
   - Use Google Search to find relevant case law and statutes
   - Identify applicable legal standards and precedents
   - Research similar cases and outcomes
   - Stay current on jurisdiction-specific rules

ANALYTICAL APPROACH:
- Be thorough and detail-oriented
- Think like a detective - question everything
- Consider multiple perspectives (plaintiff, defense, judge, jury)
- Use data and facts to support all conclusions
- Be objective about case strengths AND weaknesses

OUTPUT STYLE:
- Clear, actionable insights
- Bullet points for quick scanning
- Detailed explanations when needed
- Prioritized recommendations
- Attorney-friendly language (professional but accessible)

You are the critical thinking partner that helps legal teams build stronger cases and achieve better outcomes for clients.
"""

    def analyze_case_timeline(self, case_data: Dict[str, Any]) -> Dict[str, Any]:
        timeline = []
        all_dates = []
        
        if 'files_processed' in case_data:
            for file_result in case_data['files_processed']:
                if file_result.get('success') and 'key_info' in file_result:
                    dates = file_result['key_info'].get('dates', [])
                    for date_str in dates:
                        timeline.append({
                            'date': date_str,
                            'source': file_result.get('filename', 'Unknown'),
                            'document_type': file_result.get('classification', {}).get('primary_type', 'general')
                        })
                        all_dates.append(date_str)
        
        timeline.sort(key=lambda x: x['date'])
        
        return {
            "timeline": timeline,
            "total_events": len(timeline),
            "date_range": {
                "earliest": timeline[0]['date'] if timeline else None,
                "latest": timeline[-1]['date'] if timeline else None
            },
            "documents_with_dates": len(set(event['source'] for event in timeline)),
            "critical_dates": self.identify_critical_dates(timeline)
        }
    
    def identify_critical_dates(self, timeline: List[Dict]) -> List[Dict]:
        critical = []
        keywords = ['incident', 'accident', 'injury', 'treatment', 'demand', 'offer', 'deadline', 'filing']
        
        for event in timeline:
            if any(keyword in event.get('source', '').lower() for keyword in keywords):
                critical.append({
                    'date': event['date'],
                    'event': event['source'],
                    'importance': 'high'
                })
        
        return critical[:10]
    
    def request_document_processing(self, case_folder_path: str) -> Dict[str, Any]:
        if not self.docu_agent:
            return {
                "success": False,
                "error": "DocuAgent not available. Initialize SherlockAgent with a DocuAgent instance.",
                "message": "Agent-to-Agent communication requires DocuAgent to be passed during initialization."
            }
        
        # Resolve relative paths
        if not os.path.isabs(case_folder_path):
            # Try to resolve relative to project root
            project_root = Path(__file__).parent.parent.parent
            case_folder_path = str(project_root / case_folder_path)
        
        if not os.path.exists(case_folder_path):
            return {
                "success": False,
                "error": f"Case folder not found: {case_folder_path}",
                "message": "Please provide a valid path to a case folder containing documents."
            }
        
        print(f"\n🔄 Requesting document processing from DocuAgent...")
        print(f"   Case folder: {case_folder_path}")
        
        # Call DocuAgent to process the case folder
        case_data = self.docu_agent.process_case_folder(case_folder_path)
        
        if case_data.get('summary', {}).get('successful', 0) > 0:
            # Store the case data for analysis
            self.case_data = case_data
            
            return {
                "success": True,
                "message": f"Successfully processed {case_data['summary']['successful']} documents",
                "case_name": case_data.get('case_name', 'Unknown'),
                "summary": case_data['summary'],
                "note": "Case data is now available for analysis. You can now use analysis tools."
            }
        else:
            return {
                "success": False,
                "error": "No documents were successfully processed",
                "details": case_data.get('summary', {})
            }
    
    def identify_inconsistencies(self, case_data: Dict[str, Any]) -> Dict[str, Any]:
        inconsistencies = []
        all_amounts = []
        amount_sources = {}
        
        if 'files_processed' in case_data:
            for file_result in case_data['files_processed']:
                if file_result.get('success') and 'key_info' in file_result:
                    amounts = file_result['key_info'].get('amounts', [])
                    source = file_result.get('filename', 'Unknown')
                    
                    for amount in amounts:
                        if amount not in amount_sources:
                            amount_sources[amount] = []
                        amount_sources[amount].append(source)
                        all_amounts.append(amount)
        
        unique_amounts = set(all_amounts)
        if len(unique_amounts) > 1 and len(all_amounts) > len(unique_amounts):
            inconsistencies.append({
                'type': 'amount_discrepancy',
                'severity': 'medium',
                'description': f'Found {len(unique_amounts)} different dollar amounts across documents',
                'details': dict(list(amount_sources.items())[:5])
            })
        
        doc_types = set()
        if 'files_processed' in case_data:
            for file_result in case_data['files_processed']:
                if 'classification' in file_result:
                    doc_types.add(file_result['classification']['primary_type'])
        
        expected_docs = {'medical', 'police_report', 'insurance', 'financial'}
        missing_docs = expected_docs - doc_types
        
        if missing_docs:
            inconsistencies.append({
                'type': 'missing_document_types',
                'severity': 'high',
                'description': f'Missing critical document types: {", ".join(missing_docs)}',
                'recommendation': 'Request these documents to strengthen the case'
            })
        
        return {
            "total_inconsistencies": len(inconsistencies),
            "inconsistencies": inconsistencies,
            "severity_breakdown": {
                'high': sum(1 for i in inconsistencies if i['severity'] == 'high'),
                'medium': sum(1 for i in inconsistencies if i['severity'] == 'medium'),
                'low': sum(1 for i in inconsistencies if i['severity'] == 'low')
            },
            "requires_investigation": len([i for i in inconsistencies if i['severity'] == 'high']) > 0
        }
    
    def find_missing_evidence(self, case_data: Dict[str, Any], case_type: str = "personal_injury") -> Dict[str, Any]:
        evidence_checklists = {
            "personal_injury": [
                "police_report", "medical_records", "medical_bills", "wage_statements",
                "insurance_policy", "insurance_correspondence", "photos_of_injuries",
                "accident_scene_photos", "witness_statements", "expert_reports"
            ],
            "property_damage": [
                "police_report", "property_photos", "repair_estimates", "receipts",
                "insurance_policy", "insurance_claim", "witness_statements"
            ]
        }
        
        expected = evidence_checklists.get(case_type, evidence_checklists["personal_injury"])
        found = set()
        
        if 'files_processed' in case_data:
            for file_result in case_data['files_processed']:
                if 'classification' in file_result:
                    found.add(file_result['classification']['primary_type'])
                
                filename_lower = file_result.get('filename', '').lower()
                if 'photo' in filename_lower or 'image' in filename_lower:
                    found.add('photos')
                if 'wage' in filename_lower or 'pay' in filename_lower:
                    found.add('wage_statements')
                if 'witness' in filename_lower or 'statement' in filename_lower:
                    found.add('witness_statements')
        
        missing = [item for item in expected if item not in found]
        
        return {
            "case_type": case_type,
            "expected_evidence_count": len(expected),
            "found_evidence_count": len(found),
            "missing_evidence": missing,
            "completion_percentage": (len(found) / len(expected) * 100) if expected else 0,
            "priority_requests": missing[:5],
            "recommendations": [
                f"Request {item.replace('_', ' ')}" for item in missing[:5]
            ]
        }
    
    def calculate_damages(self, case_data: Dict[str, Any]) -> Dict[str, Any]:
        damages = {
            "medical_expenses": [],
            "property_damage": [],
            "lost_wages": [],
            "other_expenses": []
        }
        
        total_amounts = []
        
        if 'files_processed' in case_data:
            for file_result in case_data['files_processed']:
                if not file_result.get('success'):
                    continue
                
                classification = file_result.get('classification', {}).get('primary_type', 'general')
                amounts = file_result.get('key_info', {}).get('amounts', [])
                source = file_result.get('filename', 'Unknown')
                
                for amount in amounts:
                    clean_amount = float(amount.replace('$', '').replace(',', ''))
                    total_amounts.append(clean_amount)
                    
                    if classification == 'medical':
                        damages['medical_expenses'].append({
                            'amount': amount,
                            'source': source,
                            'value': clean_amount
                        })
                    elif 'property' in classification or 'damage' in source.lower():
                        damages['property_damage'].append({
                            'amount': amount,
                            'source': source,
                            'value': clean_amount
                        })
                    elif 'wage' in source.lower() or 'pay' in source.lower():
                        damages['lost_wages'].append({
                            'amount': amount,
                            'source': source,
                            'value': clean_amount
                        })
                    else:
                        damages['other_expenses'].append({
                            'amount': amount,
                            'source': source,
                            'value': clean_amount
                        })
        
        medical_total = sum(item['value'] for item in damages['medical_expenses'])
        property_total = sum(item['value'] for item in damages['property_damage'])
        wages_total = sum(item['value'] for item in damages['lost_wages'])
        other_total = sum(item['value'] for item in damages['other_expenses'])
        
        economic_damages = medical_total + property_total + wages_total + other_total
        pain_suffering_low = economic_damages * 1.5
        pain_suffering_high = economic_damages * 5.0
        
        return {
            "economic_damages": {
                "medical_expenses": medical_total,
                "property_damage": property_total,
                "lost_wages": wages_total,
                "other_expenses": other_total,
                "total": economic_damages
            },
            "non_economic_damages_estimate": {
                "low": pain_suffering_low,
                "high": pain_suffering_high,
                "factors": ["Severity of injury", "Impact on quality of life", "Duration of recovery"]
            },
            "total_case_value_range": {
                "low": economic_damages + pain_suffering_low,
                "high": economic_damages + pain_suffering_high
            },
            "damage_breakdown": damages
        }
    
    def generate_case_strategy(self, case_data: Dict[str, Any], analysis_results: Dict[str, Any]) -> Dict[str, Any]:
        strategy = {
            "strengths": [],
            "weaknesses": [],
            "opportunities": [],
            "threats": [],
            "recommendations": []
        }
        
        if 'files_processed' in case_data:
            doc_count = case_data['summary']['successful']
            
            if doc_count >= 10:
                strategy['strengths'].append("Comprehensive documentation collected")
            else:
                strategy['weaknesses'].append("Limited documentation - gather more evidence")
        
        has_medical = any(
            file_result.get('classification', {}).get('primary_type') == 'medical'
            for file_result in case_data.get('files_processed', [])
            if file_result.get('success')
        )
        
        if has_medical:
            strategy['strengths'].append("Medical documentation supports injury claims")
        else:
            strategy['weaknesses'].append("Lacking medical documentation - critical for damages")
        
        if 'damages' in analysis_results:
            total_value = analysis_results['damages']['total_case_value_range']['high']
            
            if total_value > 100000:
                strategy['opportunities'].append(f"High case value (${total_value:,.2f}) justifies litigation")
            elif total_value < 10000:
                strategy['recommendations'].append("Consider quick settlement due to lower case value")
        
        if 'inconsistencies' in analysis_results:
            high_severity = analysis_results['inconsistencies']['severity_breakdown'].get('high', 0)
            
            if high_severity > 0:
                strategy['threats'].append(f"{high_severity} high-severity inconsistencies need resolution")
                strategy['recommendations'].append("Address inconsistencies before settlement negotiations")
        
        strategy['recommendations'].extend([
            "Review statute of limitations deadlines",
            "Prepare comprehensive demand letter with full documentation",
            "Consider expert witness if case value justifies",
            "Document ongoing treatment and damages",
            "Preserve all evidence and maintain chain of custody"
        ])
        
        return strategy
    
    def cross_reference_documents(self, case_data: Dict[str, Any], search_term: str) -> Dict[str, Any]:
        matches = []
        
        if 'files_processed' in case_data:
            for file_result in case_data['files_processed']:
                if not file_result.get('success'):
                    continue
                
                text = file_result.get('text', '')
                if search_term.lower() in text.lower():
                    index = text.lower().find(search_term.lower())
                    start = max(0, index - 100)
                    end = min(len(text), index + len(search_term) + 100)
                    context = text[start:end]
                    
                    matches.append({
                        'filename': file_result.get('filename'),
                        'document_type': file_result.get('classification', {}).get('primary_type'),
                        'context': context,
                        'position': index
                    })
        
        return {
            "search_term": search_term,
            "total_matches": len(matches),
            "documents_found": len(set(m['filename'] for m in matches)),
            "matches": matches[:10]
        }
    
    def analyze_liability(self, case_data: Dict[str, Any]) -> Dict[str, Any]:
        liability_indicators = {
            "clear_liability": [],
            "shared_liability": [],
            "disputed_liability": []
        }
        
        clear_fault_keywords = ['at fault', 'negligent', 'violated', 'failed to', 'breach']
        disputed_keywords = ['dispute', 'deny', 'contest', 'disagree']
        
        if 'files_processed' in case_data:
            for file_result in case_data['files_processed']:
                if not file_result.get('success'):
                    continue
                
                text = file_result.get('text', '').lower()
                
                if any(keyword in text for keyword in clear_fault_keywords):
                    liability_indicators['clear_liability'].append(file_result.get('filename'))
                
                if any(keyword in text for keyword in disputed_keywords):
                    liability_indicators['disputed_liability'].append(file_result.get('filename'))
        
        return {
            "liability_assessment": liability_indicators,
            "clear_fault_documents": len(liability_indicators['clear_liability']),
            "disputed_documents": len(liability_indicators['disputed_liability']),
            "recommendation": "Strong liability case" if len(liability_indicators['clear_liability']) > len(liability_indicators['disputed_liability']) else "Liability may be contested"
        }
    
    def evaluate_settlement_value(self, damages: Dict[str, Any], liability_strength: str = "strong") -> Dict[str, Any]:
        if 'total_case_value_range' in damages:
            low_value = damages['total_case_value_range']['low']
            high_value = damages['total_case_value_range']['high']
        else:
            low_value = 0
            high_value = 0
        
        multipliers = {
            "strong": (0.75, 0.90),
            "moderate": (0.50, 0.70),
            "weak": (0.25, 0.50)
        }
        
        low_mult, high_mult = multipliers.get(liability_strength, (0.50, 0.70))
        
        settlement_low = low_value * low_mult
        settlement_high = high_value * high_mult
        
        return {
            "full_case_value": {
                "low": low_value,
                "high": high_value
            },
            "settlement_range": {
                "low": settlement_low,
                "high": settlement_high,
                "target": (settlement_low + settlement_high) / 2
            },
            "liability_adjustment": liability_strength,
            "negotiation_strategy": {
                "initial_demand": high_value,
                "minimum_acceptable": settlement_low,
                "realistic_settlement": settlement_high * 0.85
            }
        }
    
    def identify_legal_issues(self, case_data: Dict[str, Any]) -> Dict[str, Any]:
        legal_issues = []
        
        issue_keywords = {
            "negligence": ["negligent", "duty", "breach", "reasonable care"],
            "causation": ["caused by", "resulted from", "due to"],
            "damages": ["injury", "harm", "loss", "suffering"],
            "statute_of_limitations": ["deadline", "time limit", "statute"],
            "comparative_fault": ["also at fault", "contributory", "comparative"],
            "premises_liability": ["property owner", "hazard", "maintenance"],
            "product_liability": ["defective", "manufacturer", "design flaw"]
        }
        
        if 'files_processed' in case_data:
            for file_result in case_data['files_processed']:
                if not file_result.get('success'):
                    continue
                
                text = file_result.get('text', '').lower()
                
                for issue, keywords in issue_keywords.items():
                    if any(keyword in text for keyword in keywords):
                        if issue not in [li['issue'] for li in legal_issues]:
                            legal_issues.append({
                                'issue': issue,
                                'found_in': file_result.get('filename'),
                                'requires_research': True
                            })
        
        return {
            "identified_issues": legal_issues,
            "total_issues": len(legal_issues),
            "primary_cause_of_action": legal_issues[0]['issue'] if legal_issues else "negligence",
            "research_recommendations": [
                f"Research {issue['issue']} case law in jurisdiction"
                for issue in legal_issues[:3]
            ]
        }
    
    def recommend_next_steps(self, full_analysis: Dict[str, Any]) -> Dict[str, Any]:
        next_steps = []
        
        if 'missing_evidence' in full_analysis and full_analysis['missing_evidence'].get('missing_evidence'):
            next_steps.append({
                'priority': 1,
                'action': 'Gather Missing Evidence',
                'details': f"Request: {', '.join(full_analysis['missing_evidence']['missing_evidence'][:3])}",
                'timeline': 'Within 7 days'
            })
        
        if 'inconsistencies' in full_analysis:
            high_issues = full_analysis['inconsistencies']['severity_breakdown'].get('high', 0)
            if high_issues > 0:
                next_steps.append({
                    'priority': 1,
                    'action': 'Resolve Inconsistencies',
                    'details': f"{high_issues} high-priority inconsistencies need investigation",
                    'timeline': 'Immediate'
                })
        
        if 'settlement' in full_analysis:
            next_steps.append({
                'priority': 2,
                'action': 'Prepare Demand Letter',
                'details': f"Target settlement: ${full_analysis['settlement']['settlement_range']['target']:,.2f}",
                'timeline': 'Within 14 days'
            })
        
        if 'legal_issues' in full_analysis and full_analysis['legal_issues'].get('research_recommendations'):
            next_steps.append({
                'priority': 3,
                'action': 'Conduct Legal Research',
                'details': full_analysis['legal_issues']['research_recommendations'][0],
                'timeline': 'Within 7 days'
            })
        
        next_steps.extend([
            {
                'priority': 3,
                'action': 'Review Statute of Limitations',
                'details': 'Confirm all deadlines are calendared',
                'timeline': 'Within 3 days'
            },
            {
                'priority': 4,
                'action': 'Client Communication',
                'details': 'Update client on case status and analysis',
                'timeline': 'Within 7 days'
            }
        ])
        
        next_steps.sort(key=lambda x: x['priority'])
        
        return {
            "next_steps": next_steps,
            "total_actions": len(next_steps),
            "immediate_actions": [step for step in next_steps if step['priority'] == 1],
            "short_term_actions": [step for step in next_steps if step['priority'] == 2],
            "ongoing_actions": [step for step in next_steps if step['priority'] >= 3]
        }
    
    def perform_full_case_analysis(self, case_data: Dict[str, Any] = None) -> Dict[str, Any]:
        # Use provided case_data or fall back to stored case_data
        if case_data is None:
            if self.case_data is None:
                return {
                    "success": False,
                    "error": "No case data available for analysis",
                    "message": "Please use request_document_processing tool first to process documents."
                }
            case_data = self.case_data
        
        print(f"\n{'='*80}")
        print(f"🔍 SHERLOCK AGENT - CASE ANALYSIS")
        print(f"{'='*80}\n")
        
        print("Step 1: Building case timeline...")
        timeline = self.analyze_case_timeline(case_data)
        print(f"✅ Identified {timeline['total_events']} dated events\n")
        
        # Step 3: Find inconsistencies
        print("Step 3: Checking for inconsistencies...")
        inconsistencies = self.identify_inconsistencies(case_data)
        print(f"✅ Found {inconsistencies['total_inconsistencies']} potential issues\n")
        
        # Step 4: Identify missing evidence
        print("Step 4: Identifying missing evidence...")
        missing_evidence = self.find_missing_evidence(case_data)
        print(f"✅ {missing_evidence['completion_percentage']:.1f}% evidence completeness\n")
        
        # Step 5: Calculate damages
        print("Step 5: Calculating damages...")
        damages = self.calculate_damages(case_data)
        print(f"✅ Total economic damages: ${damages['economic_damages']['total']:,.2f}\n")
        
        # Step 6: Analyze liability
        print("Step 6: Analyzing liability...")
        liability = self.analyze_liability(case_data)
        print(f"✅ {liability['recommendation']}\n")
        
        # Step 7: Identify legal issues
        print("Step 7: Identifying legal issues...")
        legal_issues = self.identify_legal_issues(case_data)
        print(f"✅ Identified {legal_issues['total_issues']} legal issues\n")
        
        # Step 8: Evaluate settlement
        print("Step 8: Evaluating settlement value...")
        settlement = self.evaluate_settlement_value(damages, "strong")
        print(f"✅ Settlement range: ${settlement['settlement_range']['low']:,.2f} - ${settlement['settlement_range']['high']:,.2f}\n")
        
        # Step 9: Generate strategy
        print("Step 9: Generating case strategy...")
        analysis_results = {
            'damages': damages,
            'inconsistencies': inconsistencies,
            'liability': liability
        }
        strategy = self.generate_case_strategy(case_data, analysis_results)
        print(f"✅ Strategy developed with {len(strategy['recommendations'])} recommendations\n")
        
        print("Step 9: Creating action plan...")
        full_analysis = {
            'missing_evidence': missing_evidence,
            'inconsistencies': inconsistencies,
            'settlement': settlement,
            'legal_issues': legal_issues
        }
        next_steps = self.recommend_next_steps(full_analysis)
        print(f"✅ {next_steps['total_actions']} action items prioritized\n")
        
        complete_analysis = {
            "case_name": case_data.get('case_name', 'Unknown'),
            "analysis_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "document_processing": case_data['summary'],
            "timeline_analysis": timeline,
            "inconsistencies": inconsistencies,
            "missing_evidence": missing_evidence,
            "damage_calculation": damages,
            "liability_analysis": liability,
            "legal_issues": legal_issues,
            "settlement_evaluation": settlement,
            "case_strategy": strategy,
            "next_steps": next_steps,
            "case_strength_score": self._calculate_case_strength(
                missing_evidence, inconsistencies, damages, liability
            )
        }
        
        return complete_analysis
    
    def _calculate_case_strength(self, missing_evidence, inconsistencies, damages, liability) -> Dict[str, Any]:
        score = 100
        
        completion = missing_evidence.get('completion_percentage', 0)
        score -= (100 - completion) * 0.3
        
        high_issues = inconsistencies['severity_breakdown'].get('high', 0)
        score -= high_issues * 10
        
        total_value = damages.get('total_case_value_range', {}).get('high', 0)
        if total_value < 10000:
            score -= 10
        elif total_value > 100000:
            score += 10
        
        score = max(0, min(100, score))
        
        if score >= 80:
            rating = "Excellent"
        elif score >= 60:
            rating = "Good"
        elif score >= 40:
            rating = "Fair"
        else:
            rating = "Weak"
        
        return {
            "score": round(score, 1),
            "rating": rating,
            "confidence": "high" if completion > 80 else "moderate"
        }

    async def analyze_case(self, input_data: Dict[str, Any]):
        print(f"\n{'='*60}")
        print("Sherlock Agent Initialized")
        print(f"{'='*60}\n")

        APP_NAME = "saulgoodman"
        USER_ID = input_data['ID']['userid']
        SESSION_ID = input_data['ID']['sessionid']

        session_service = InMemorySessionService()
        await session_service.create_session(app_name=APP_NAME, user_id=USER_ID, session_id=SESSION_ID)

        # Create a conversation-only agent without tools to avoid function calling issues
        conversation_agent = Agent(
            name="sherlock_agent_conversation",
            model=MODEL_ID,
            description="Strategic analytical agent for case analysis conversations",
            instruction="""You are the Sherlock Agent, providing strategic analysis and creative insights on legal cases.
            
Focus on:
- Pattern recognition and inconsistencies
- Strategic recommendations
- Alternative perspectives
- Risk assessment
- Settlement strategies

Provide clear, actionable analysis based on the information shared. Be concise and direct."""
        )

        runner = Runner(agent=conversation_agent, app_name=APP_NAME, session_service=session_service)
        content = types.Content(role='user', parts=[types.Part(text=input_data['message'])])
        events = runner.run(user_id=USER_ID, session_id=SESSION_ID, new_message=content)

        for event in events:
            if event.is_final_response():
                return event.content.parts[0].text


if __name__ == "__main__":
    print("\n" + "=" * 80)
    print("SHERLOCK AGENT - COMPREHENSIVE CASE ANALYSIS WITH A2A")
    print("=" * 80)
    
    # Initialize agents with A2A communication
    docu_agent = DocuAgent()
    sherlock_agent = SherlockAgent(docu_agent=docu_agent)
    
    if len(sys.argv) > 1:
        case_folder = sys.argv[1]
    else:
        test_data_path = Path(__file__).parent.parent.parent / "data" / "test"
        if test_data_path.exists():
            available_cases = [d.name for d in test_data_path.iterdir() if d.is_dir() and not d.name.startswith('.')]
            if available_cases:
                print(f"\n📁 Available test cases: {', '.join(available_cases)}")
                print(f"\nUsage: python {Path(__file__).name} <case_folder_path>")
                print(f"Example: python {Path(__file__).name} data/test/case_1")
                print(f"\nUsing first available case: {available_cases[0]}\n")
                case_folder = str(test_data_path / available_cases[0])
            else:
                print("\n⚠️  No test cases found in data/test/")
                print("Please provide a case folder path as an argument.")
                sys.exit(1)
        else:
            print("\n⚠️  Test data directory not found: data/test/")
            print("Please provide a case folder path as an argument.")
            sys.exit(1)
    
    # Step 1: Request document processing via A2A communication
    print(f"\n{'='*80}")
    print("STEP 1: Document Processing (via DocuAgent)")
    print(f"{'='*80}\n")
    
    processing_result = sherlock_agent.request_document_processing(case_folder)
    
    if not processing_result.get('success'):
        print(f"❌ Error: {processing_result.get('error')}")
        print(f"   {processing_result.get('message', '')}")
        sys.exit(1)
    
    print(f"✅ {processing_result['message']}")
    print(f"   Case: {processing_result['case_name']}")
    print(f"   Files processed: {processing_result['summary']['successful']}/{processing_result['summary']['total_files']}")
    
    # Step 2: Perform comprehensive analysis
    print(f"\n{'='*80}")
    print("STEP 2: Sherlock Analysis")
    print(f"{'='*80}\n")
    
    analysis = sherlock_agent.perform_full_case_analysis()
    
    if not analysis.get('success', True):
        print(f"❌ Error: {analysis.get('error')}")
        sys.exit(1)
    
    # Display results
    print(f"\n{'='*80}")
    print("📊 ANALYSIS SUMMARY")
    print(f"{'='*80}\n")
    
    print(f"Case: {analysis['case_name']}")
    print(f"Analysis Date: {analysis['analysis_date']}")
    print(f"Case Strength: {analysis['case_strength_score']['rating']} ({analysis['case_strength_score']['score']}/100)\n")
    
    print("💰 DAMAGES:")
    damages = analysis['damage_calculation']['economic_damages']
    print(f"  Medical: ${damages['medical_expenses']:,.2f}")
    print(f"  Property: ${damages['property_damage']:,.2f}")
    print(f"  Lost Wages: ${damages['lost_wages']:,.2f}")
    print(f"  Total Economic: ${damages['total']:,.2f}")
    print(f"  Estimated Case Value: ${analysis['damage_calculation']['total_case_value_range']['low']:,.2f} - ${analysis['damage_calculation']['total_case_value_range']['high']:,.2f}\n")
    
    print("⚖️ SETTLEMENT RECOMMENDATION:")
    settlement = analysis['settlement_evaluation']
    print(f"  Range: ${settlement['settlement_range']['low']:,.2f} - ${settlement['settlement_range']['high']:,.2f}")
    print(f"  Target: ${settlement['settlement_range']['target']:,.2f}\n")
    
    print("🎯 CASE STRATEGY:")
    strategy = analysis['case_strategy']
    print(f"  Strengths: {len(strategy['strengths'])}")
    for strength in strategy['strengths']:
        print(f"    ✓ {strength}")
    print(f"  Weaknesses: {len(strategy['weaknesses'])}")
    for weakness in strategy['weaknesses'][:3]:
        print(f"    ✗ {weakness}")
    print()
    
    print("📋 NEXT STEPS:")
    for step in analysis['next_steps']['immediate_actions']:
        print(f"  🔴 [{step['timeline']}] {step['action']}")
        print(f"     {step['details']}\n")
    
    # Save analysis results
    output_dir = Path(__file__).parent.parent.parent / "data" / "out"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / "sherlock_case_analysis.json"
    
    with open(output_file, 'w') as f:
        json.dump(analysis, f, indent=2)
    
    print(f"💾 Full analysis saved to: {output_file}")
    print(f"\n{'='*80}")
    print("✨ ANALYSIS COMPLETE")
    print(f"{'='*80}\n")