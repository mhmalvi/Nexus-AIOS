
import asyncio
import sys
import os
import json
from unittest.mock import MagicMock, AsyncMock

# Add kernel to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from agents.manager_agent import ManagerAgent
from toolbox import Toolbox

async def test_failure_limit():
    print("TEST: Configurable Failure Limit")
    
    # Mock dependencies
    brain = AsyncMock()
    # Mock plan to return a step
    brain.plan.return_value = MagicMock(steps=[MagicMock(id="step1", tool="fail_tool", action="fail", args={})])
    # Mock generating correction
    brain.generate.return_value = "try again"
    
    worker = AsyncMock()
    # Mock execution failure with needs_retry=True
    fail_result = MagicMock(success=False, output=None, error="error", needs_retry=True, correction="fix it")
    worker.execute_step.return_value = fail_result
    
    # Initialize with limit 1
    manager = ManagerAgent(brain, worker, failure_limit=1)
    
    await manager.execute_task("test task")
    
    # Check if retry happened exactly once (initial + 1 retry = 2 calls)
    # Actually logic is: execute -> fail -> retry (count=1) -> fail -> break (retry_count < max_retries check)
    # If limit is 1:
    # 1. Execute (fail) -> count=0 -> 0 < 1 -> retry
    # 2. Execute (fail) -> count=1 -> 1 < 1 -> False -> break
    # So we expect 2 calls to execute_step
    
    call_count = worker.execute_step.call_count
    print(f"  Result: Call count = {call_count} (Expected 2)")
    assert call_count == 2, f"Expected 2 calls, got {call_count}"
    print("  ✅ Passed")

async def test_custom_tools():
    print("\nTEST: Custom Tool Registration")
    
    toolbox = Toolbox()
    
    # Create dummy tool
    os.makedirs("custom_tools_test", exist_ok=True)
    with open("custom_tools_test/my_tool.py", "w") as f:
        f.write('''
TOOL_METADATA = {
    "name": "my_custom_tool",
    "description": "A test tool",
    "args": {"arg1": "string"}
}

def run(arg1):
    return f"Ran with {arg1}"
''')
    
    try:
        toolbox.load_custom_tools("custom_tools_test")
        
        tools = toolbox.list_tools()
        tool_names = [t["name"] for t in tools]
        
        print(f"  Result: Tools found = {tool_names}")
        assert "my_custom_tool" in tool_names
        
        result = await toolbox.execute("my_custom_tool", kwargs={"arg1": "foo"})
        print(f"  Exec Result: {result.output}")
        assert result.output == "Ran with foo"
        print("  ✅ Passed")
        
    finally:
        import shutil
        if os.path.exists("custom_tools_test"):
            shutil.rmtree("custom_tools_test")

async def test_tao_visualization():
    print("\nTEST: TAO Visualization")
    
    # Capture stdout
    from io import StringIO
    old_stdout = sys.stdout
    sys.stdout = mystdout = StringIO()
    
    try:
         # Reuse mock setup
        brain = AsyncMock()
        brain.plan.return_value = MagicMock(steps=[MagicMock(id="step1", tool="shell", action="echo", args={})])
        worker = AsyncMock()
        worker.execute_step.return_value = MagicMock(success=True, output="done", error=None)
        worker.toolbox = MagicMock()
        worker.toolbox.list_tools.return_value = []
        
        manager = ManagerAgent(brain, worker)
        
        await manager.execute_task("test task")
        
        output = mystdout.getvalue()
        print(output, file=old_stdout) # echo to real stdout for debug
        
        json_lines = [json.loads(line) for line in output.strip().split('\n') if line.strip().startswith('{')]
        tao_events = [e for e in json_lines if e.get("message_type") == "tao_event"]
        
        print(f"  Result: TAO events captured = {len(tao_events)}", file=old_stdout)
        
        types = [e["data"]["type"] for e in tao_events]
        assert "THOUGHT" in types
        assert "ACTION" in types
        assert "OBSERVATION" in types
        print("  ✅ Passed", file=old_stdout)
        
    finally:
        sys.stdout = old_stdout

if __name__ == "__main__":
    asyncio.run(test_failure_limit())
    asyncio.run(test_custom_tools())
    asyncio.run(test_tao_visualization())
