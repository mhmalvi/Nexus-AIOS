from typing import Dict, Any, List
import json

class CodeArchitectAgent:
    """
    Specialized agent for software design and architecture.
    Responsible for planning file structures, component relationships, and high-level patterns.
    """
    
    def __init__(self, brain):
        self.brain = brain
        
    async def design_feature(self, requirements: str, context: str = "") -> Dict[str, Any]:
        """Generate a high-level design for a feature"""
        prompt = f"""
        As a Senior Software Architect, design a solution for the following requirements:
        
        Requirements:
        {requirements}
        
        Context/Existing Architecture:
        {context}
        
        Provide a JSON response with:
        - architecture_summary: string
        - components: list of { "name": str, "responsibility": str, "dependencies": list[str] }
        - files_to_create: list of str
        - files_to_modify: list of str
        - design_patterns: list of str
        """
        
        response = await self.brain.generate(prompt, temperature=0.2)
        
        try:
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0].strip()
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0].strip()
            else:
                json_str = response
            return json.loads(json_str)
        except:
            return {"raw_design": response}

    async def review_structure(self, file_tree: str) -> str:
        """Review project structure for organization and scalability"""
        prompt = f"""
        Review the following project structure:
        {file_tree}
        
        Suggest improvements for folder organization, modularity, and scalability.
        """
        return await self.brain.generate(prompt)
    
    async def analyze_task(self, task_description: str) -> Dict[str, Any]:
        """Analyze a task from an architecture perspective (for War Room)"""
        prompt = f"""As a Software Architect, analyze this task for design considerations:

Task: {task_description}

Consider:
1. Component structure and modularity
2. Scalability implications
3. Integration points
4. Technical debt risks

Provide a brief architectural assessment."""
        
        try:
            analysis = await self.brain.generate(prompt, temperature=0.2, max_tokens=300)
            return {"agent": "architect", "analysis": analysis}
        except Exception as e:
            return {"agent": "architect", "error": str(e)}
