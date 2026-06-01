import asyncio
import sys
import os
from typing import Dict, Any, Optional

# Try importing mcp, but handle if missing (since we just added it to requirements)
try:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    MCP_AVAILABLE = True
except ImportError:
    MCP_AVAILABLE = False
    print("⚠️ MCP library not found. Install 'mcp' to use Client features.", file=sys.stderr)

class MCPClientManager:
    """
    Manages connections to external MCP servers (Agent-to-Agent).
    Connects to servers, discovers tools, and registers them in the Toolbox.
    """
    
    def __init__(self, toolbox):
        self.toolbox = toolbox
        self.sessions: Dict[str, Any] = {}
        self.stop_events: Dict[str, asyncio.Event] = {}
        self.tasks: Dict[str, asyncio.Task] = {}
    
    async def connect_stdio(self, name: str, command: str, args: list = None, env: dict = None) -> bool:
        """Connect to an MCP server via stdio"""
        if not MCP_AVAILABLE:
            return False
            
        if name in self.sessions:
            print(f"MCP Server {name} already connected.", file=sys.stderr)
            return True
            
        args = args or []
        env = env or os.environ.copy()
        
        server_params = StdioServerParameters(
            command=command,
            args=args,
            env=env
        )
        
        # Create stop event
        self.stop_events[name] = asyncio.Event()
        
        # Start background task
        task = asyncio.create_task(self._run_session(name, server_params))
        self.tasks[name] = task
        
        # Wait a bit to ensure it initializes
        # Real implementation should use a ready event, but 1s is okay for PoC
        await asyncio.sleep(1.0)
        
        return not task.done() # If done, it crashed
        
    async def _run_session(self, name: str, params: Any):
        print(f"🔌 Connecting to MCP Server: {name}...", file=sys.stderr)
        try:
            async with stdio_client(params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    
                    self.sessions[name] = session
                    print(f"✅ Connected to {name}", file=sys.stderr)
                    
                    # List and register tools
                    result = await session.list_tools()
                    
                    count = 0
                    for tool in result.tools:
                        # Namespaced tool name: source_toolname
                        tool_name = f"{name}_{tool.name}"
                        
                        # Create closure for tool execution
                        async def make_tool_wrapper(t_name=tool.name):
                            async def wrapper(**kwargs):
                                return await session.call_tool(t_name, arguments=kwargs)
                            return wrapper
                        
                        self.toolbox.register_tool(
                            name=tool_name,
                            func=await make_tool_wrapper(),
                            description=f"[{name}] {tool.description or ''}",
                            args_schema=tool.inputSchema
                        )
                        count += 1
                        
                    print(f"🛠️ Registered {count} tools from {name}", file=sys.stderr)
                    
                    # Wait until stopped
                    await self.stop_events[name].wait()
                    
        except Exception as e:
            print(f"❌ MCP Client {name} error: {e}", file=sys.stderr)
        finally:
            if name in self.sessions:
                del self.sessions[name]
            print(f"🔌 Disconnected from {name}", file=sys.stderr)

    async def disconnect(self, name: str):
        """Disconnect from a server"""
        if name in self.stop_events:
            self.stop_events[name].set()
            if name in self.tasks:
                await self.tasks[name]
                del self.tasks[name]
            del self.stop_events[name]
