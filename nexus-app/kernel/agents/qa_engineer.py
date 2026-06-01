from typing import Dict, Any, List
import json
import os

class QAAgent:
    """
    Specialized agent for Quality Assurance (QA).
    Responsible for generating test cases, writing test files, and verifying code.
    """
    
    def __init__(self, brain, toolbox):
        self.brain = brain
        self.toolbox = toolbox
        
    async def generate_tests(self, target_file: str, context: str = "") -> Dict[str, Any]:
        """Generate unit tests for a target file"""
        
        # Read target file
        read_res = await self.toolbox.execute("read_file", args=[target_file])
        if not read_res.success:
            return {"success": False, "error": f"Could not read {target_file}: {read_res.error}"}
            
        code_content = read_res.output
        
        # Generate tests
        prompt = f"""
        Generate Pytest unit tests for the following code.
        File: {target_file}
        
        Code:
        ```python
        {code_content}
        ```
        
        Context: {context}
        
        Return the python test code. Wrapl in ```python block.
        """
        
        test_code_raw = await self.brain.generate(prompt)
        
        # Extract code
        test_code = test_code_raw
        if "```python" in test_code:
            test_code = test_code.split("```python")[1].split("```")[0].strip()
        elif "```" in test_code:
            test_code = test_code.split("```")[1].split("```")[0].strip()
            
        # Determine test filename
        base_name = os.path.basename(target_file)
        dir_name = os.path.dirname(target_file)
        test_filename = os.path.join(dir_name, f"test_{base_name}")
        
        # Write test file
        write_res = await self.toolbox.execute("write_file", args=[test_filename, test_code])
        
        if write_res.success:
            return {
                "success": True,
                "created_file": test_filename,
                "test_code_preview": test_code[:200] + "..."
            }
        else:
            return {
                "success": False, 
                "error": f"Failed to save test file: {write_res.error}",
                "generated_code": test_code
            }
    
    async def analyze_task(self, task_description: str) -> Dict[str, Any]:
        """Analyze a task from a QA perspective (for War Room)"""
        prompt = f"""As a QA Engineer, analyze this task for quality considerations:

Task: {task_description}

Consider:
1. Testing requirements
2. Edge cases and failure modes
3. Validation/verification needs
4. Quality metrics to track

Provide a brief QA assessment."""
        
        try:
            analysis = await self.brain.generate(prompt, temperature=0.2, max_tokens=300)
            return {"agent": "qa", "analysis": analysis}
        except Exception as e:
            return {"agent": "qa", "error": str(e)}
