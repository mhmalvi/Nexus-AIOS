"""
AETHER Intent Dispatcher -- Routes classified intents to handlers.

Routes:
- "command" intents -> Toolbox execution (system commands)
- "query" intents -> AI generation with context
- "task" intents -> Planner + Agent orchestration
- "conversation" intents -> Direct AI generation
"""

import logging
from dataclasses import dataclass, field
from typing import Optional, Dict, Any

logger = logging.getLogger("aether.dispatcher")


@dataclass
class DispatchResult:
    """Result of intent routing."""
    route: str  # "tool", "ai", "plan", "conversation", "blocked", "approval_needed"
    response: str
    tool_used: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class IntentDispatcher:
    """
    Routes parsed intents to the appropriate handler.

    Usage:
        dispatcher = IntentDispatcher(brain=brain, toolbox=toolbox, supervisor=supervisor)
        result = await dispatcher.dispatch(parsed_intent)
    """

    SYSTEM_COMMANDS = {
        "open", "close", "run", "execute", "start", "stop", "kill",
        "create", "delete", "remove", "move", "copy", "rename",
        "install", "uninstall", "list", "show", "screenshot",
    }

    TOOL_MAPPING = {
        "open": "shell", "run": "shell", "execute": "shell",
        "start": "shell", "stop": "shell", "kill": "shell",
        "create": "write_file", "delete": "shell", "remove": "shell",
        "move": "shell", "copy": "shell", "rename": "shell",
        "list": "list_dir", "show": "list_dir",
        "install": "shell", "uninstall": "shell",
        "screenshot": "capture_screen",
    }

    def __init__(self, brain=None, toolbox=None, supervisor=None):
        self._brain = brain
        self._toolbox = toolbox
        self._supervisor = supervisor

    async def dispatch(self, intent) -> DispatchResult:
        """Route an intent to the appropriate handler."""
        intent_type = getattr(intent, "intent_type", "conversation")
        action = getattr(intent, "action", "")

        if intent_type == "command" and action in self.SYSTEM_COMMANDS:
            return await self._dispatch_tool(intent)
        elif intent_type == "task":
            return await self._dispatch_plan(intent)
        elif intent_type == "query":
            return await self._dispatch_ai(intent, mode="query")
        else:
            return await self._dispatch_ai(intent, mode="conversation")

    async def _dispatch_tool(self, intent) -> DispatchResult:
        """Execute a system command via toolbox."""
        if not self._toolbox:
            return DispatchResult(route="conversation", response="Toolbox not available.")

        original_text = getattr(intent, "original_text", str(intent))

        if self._supervisor:
            validation = self._supervisor.validate(original_text)
            if not validation.is_safe:
                return DispatchResult(
                    route="blocked",
                    response=f"Blocked: {validation.reason}",
                )
            if validation.requires_approval:
                return DispatchResult(
                    route="approval_needed",
                    response="This action requires approval.",
                    metadata={"action": original_text},
                )

        action = getattr(intent, "action", "shell")
        tool_name = self.TOOL_MAPPING.get(action)
        entities = getattr(intent, "entities", {})

        # Semantic fallback: use LLM to select the best tool when keyword matching fails
        if not tool_name and self._brain and self._toolbox:
            tool_name = await self._select_tool_semantically(original_text)

        tool_name = tool_name or "shell"
        result = await self._toolbox.execute(tool_name, kwargs=entities)

        return DispatchResult(
            route="tool",
            response=str(result.output) if result.success else f"Error: {result.error}",
            tool_used=tool_name,
        )

    async def _select_tool_semantically(self, user_text: str) -> Optional[str]:
        """Use LLM to select the best tool for a command when keyword matching fails."""
        try:
            tools = self._toolbox.list_tools()
            tool_list = "\n".join(
                f"- {t['name']}: {t.get('description', 'No description')}"
                for t in tools[:20]  # cap to avoid prompt bloat
            )
            prompt = (
                f"Given the user command: \"{user_text}\"\n\n"
                f"Available tools:\n{tool_list}\n\n"
                f"Reply with ONLY the tool name that best matches. "
                f"If no tool fits, reply 'shell'."
            )
            result = await self._brain.generate(
                prompt=prompt, temperature=0.0, max_tokens=30
            )
            chosen = result.strip().split("\n")[0].strip().lower()
            known = {t["name"] for t in tools}
            return chosen if chosen in known else None
        except Exception as e:
            logger.debug("Semantic tool selection failed: %s", e)
            return None

    async def _dispatch_plan(self, intent) -> DispatchResult:
        """Create a multi-step plan for a complex task."""
        if not self._brain:
            return DispatchResult(route="conversation", response="Brain not available.")

        original_text = getattr(intent, "original_text", str(intent))
        tools = self._toolbox.list_tools() if self._toolbox else []
        plan = await self._brain.plan(original_text, tools)

        return DispatchResult(
            route="plan",
            response=f"Plan created with {len(plan)} steps.",
            metadata={"plan": plan},
        )

    async def _dispatch_ai(self, intent, mode: str = "conversation") -> DispatchResult:
        """Generate an AI response."""
        if not self._brain:
            return DispatchResult(route="conversation", response="Brain not available.")

        original_text = getattr(intent, "original_text", str(intent))
        system_prompt = (
            "Answer the user's question directly and accurately."
            if mode == "query" else None
        )
        response = await self._brain.generate(
            prompt=original_text,
            system_prompt=system_prompt,
        )
        return DispatchResult(route="ai", response=response)
