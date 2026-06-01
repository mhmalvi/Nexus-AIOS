from typing import Dict, Any, List
import json

class SecurityAuditorAgent:
    """
    Specialized agent for security review and auditing.
    Responsible for analyzing code and plans for vulnerabilities and safety risks.
    """
    
    def __init__(self, brain):
        self.brain = brain
        
    async def audit_code(self, code: str, language: str = "python") -> Dict[str, Any]:
        """Review code for security vulnerabilities"""
        prompt = f"""
        As a Senior Security Engineer, analyze the following {language} code for security vulnerabilities.
        Focus on: command injection, path traversal, sensitive data exposure, and unsafe input handling.
        
        Code:
        ```{language}
        {code}
        ```
        
        Provide your analysis in JSON format with:
        - is_safe: boolean
        - risk_score: 0-10 (10 is most dangerous)
        - vulnerabilities: list of objects { "type": str, "description": str, "severity": "low|medium|high|critical" }
        - recommendations: list of strings
        """
        
        response = await self.brain.generate(prompt, temperature=0.1)
        
        try:
            # Simple heuristic to extract JSON if LLM wraps it in markdown
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0].strip()
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0].strip()
            else:
                json_str = response
                
            return json.loads(json_str)
        except Exception:
            # Fallback if specific structure parsing fails
            return {
                "is_safe": False, 
                "risk_score": 5, 
                "vulnerabilities": [{"type": "ParserError", "severity": "medium", "description": "Could not parse security report"}],
                "raw_analysis": response
            }

    async def review_plan(self, task_description: str, proposed_steps: List[Dict]) -> Dict[str, Any]:
        """Review an execution plan for high-risk sequences"""
        prompt = f"""
        Review the following execution plan for safety.
        Task: {task_description}
        
        Steps:
        {json.dumps(proposed_steps, indent=2)}
        
        Identify any dangerous sequences (e.g., downloading then executing, deleting without backup).
        Return 'APPROVED' if safe, or a warning message if unsafe.
        """
        return await self.brain.generate(prompt, temperature=0.1)
    
    async def analyze_task(self, task_description: str) -> Dict[str, Any]:
        """Analyze a task from a security perspective (for War Room)"""
        prompt = f"""As a Security Expert, analyze this task for potential security implications:

Task: {task_description}

Consider:
1. Data security risks
2. Permission/access concerns
3. External dependencies and trust boundaries
4. Sensitive information handling

Provide a brief security assessment."""
        
        try:
            analysis = await self.brain.generate(prompt, temperature=0.2, max_tokens=300)
            return {"agent": "security", "analysis": analysis}
        except Exception as e:
            return {"agent": "security", "error": str(e)}
