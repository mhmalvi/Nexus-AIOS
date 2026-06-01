from mcp.server.fastmcp import FastMCP
from toolbox import Toolbox
import asyncio
import json

# Initialize Toolbox
toolbox = Toolbox()

# Create MCP Server
mcp = FastMCP("Nexus AIOS Kernel")

@mcp.tool()
async def execute_command(command: str) -> str:
    """
    Execute a shell command in the Nexus environment.
    Use this to run system commands, scripts, or manage processes.
    """
    try:
        result = await toolbox.execute("shell", args=[command])
        if result.success:
            return str(result.output)
        else:
            return f"Error: {result.error}"
    except Exception as e:
        return f"Execution failed: {str(e)}"

@mcp.tool()
async def read_file(path: str) -> str:
    """
    Read the contents of a file from the local filesystem.
    """
    try:
        result = await toolbox.execute("read_file", args=[path])
        if result.success:
            return str(result.output)
        else:
            return f"Error reading file: {result.error}"
    except Exception as e:
        return f"Read failed: {str(e)}"

@mcp.tool()
async def write_file(path: str, content: str) -> str:
    """
    Write text content to a file. 
    Creates the file if it doesn't exist. Overwrites if it does.
    """
    try:
        result = await toolbox.execute("write_file", args=[path, content])
        if result.success:
            return f"Successfully wrote to {path}"
        else:
            return f"Error writing file: {result.error}"
    except Exception as e:
        return f"Write failed: {str(e)}"

@mcp.tool()
async def list_directory(path: str = ".") -> str:
    """
    List contents of a directory.
    """
    try:
        result = await toolbox.execute("list_dir", args=[path])
        if result.success:
            # Format list output cleanly
            if isinstance(result.output, list):
                return json.dumps(result.output, indent=2)
            return str(result.output)
        else:
            return f"Error listing directory: {result.error}"
    except Exception as e:
        return f"List failed: {str(e)}"

if __name__ == "__main__":
    print("🚀 Nexus MCP Server starting...", flush=True)
    mcp.run()
