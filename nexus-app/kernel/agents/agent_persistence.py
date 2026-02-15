import json
import logging
import time
from pathlib import Path
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict, field

logger = logging.getLogger("aether.agent_persistence")

@dataclass
class AgentConfig:
    id: str
    name: str
    avatar: str
    description: str
    model: str
    provider: str
    tool_policy: str  # mapped from toolPolicy
    persona: str
    memory_scope: str # mapped from memoryScope
    status: str
    triggers: List[str]
    channels: List[str]
    created_at: str
    sessions_count: int = 0
    tokens_used: int = 0
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'AgentConfig':
        # Handle camelCase to snake_case mapping for incoming JSON
        return cls(
            id=data.get('id', ''),
            name=data.get('name', ''),
            avatar=data.get('avatar', '🤖'),
            description=data.get('description', ''),
            model=data.get('model', ''),
            provider=data.get('provider', ''),
            tool_policy=data.get('toolPolicy', data.get('tool_policy', 'minimal')),
            persona=data.get('persona', ''),
            memory_scope=data.get('memoryScope', data.get('memory_scope', 'shared')),
            status=data.get('status', 'idle'),
            triggers=data.get('triggers', []),
            channels=data.get('channels', []),
            created_at=data.get('createdAt', data.get('created_at', '')),
            sessions_count=data.get('sessionsCount', data.get('sessions_count', 0)),
            tokens_used=data.get('tokensUsed', data.get('tokens_used', 0))
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "avatar": self.avatar,
            "description": self.description,
            "model": self.model,
            "provider": self.provider,
            "toolPolicy": self.tool_policy,
            "persona": self.persona,
            "memoryScope": self.memory_scope,
            "status": self.status,
            "triggers": self.triggers,
            "channels": self.channels,
            "createdAt": self.created_at,
            "sessionsCount": self.sessions_count,
            "tokensUsed": self.tokens_used
        }

class AgentPersistence:
    def __init__(self, storage_dir: str):
        self.storage_dir = Path(storage_dir)
        self.agents_file = self.storage_dir / "agents.json"
        self.layout_file = self.storage_dir / "agent_layout.json"
        
        self.agents: Dict[str, AgentConfig] = {}
        self.layout: Dict[str, Any] = {"connections": [], "positions": {}}
        
        self._ensure_storage()
        self._load()

    def _ensure_storage(self):
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def _load(self):
        # Load Agents
        if self.agents_file.exists():
            try:
                data = json.loads(self.agents_file.read_text(encoding='utf-8'))
                for agent_data in data:
                    agent = AgentConfig.from_dict(agent_data)
                    # Reset runtime status on load
                    if agent.status == 'running':
                        agent.status = 'idle'
                    self.agents[agent.id] = agent
                logger.info(f"Loaded {len(self.agents)} agents from storage")
            except Exception as e:
                logger.error(f"Failed to load agents: {e}")

        # Load Layout
        if self.layout_file.exists():
            try:
                self.layout = json.loads(self.layout_file.read_text(encoding='utf-8'))
                logger.info("Loaded agent layout")
            except Exception as e:
                logger.error(f"Failed to load layout: {e}")

    def _save_agents(self):
        try:
            data = [agent.to_dict() for agent in self.agents.values()]
            self.agents_file.write_text(json.dumps(data, indent=2), encoding='utf-8')
        except Exception as e:
            logger.error(f"Failed to save agents: {e}")

    def _save_layout(self):
        try:
            self.layout_file.write_text(json.dumps(self.layout, indent=2), encoding='utf-8')
        except Exception as e:
            logger.error(f"Failed to save layout: {e}")

    # --- Public API ---

    def register_agent(self, agent_data: Dict[str, Any]) -> AgentConfig:
        """Register or update an agent configuration."""
        agent = AgentConfig.from_dict(agent_data)
        self.agents[agent.id] = agent
        self._save_agents()
        return agent

    def unregister_agent(self, agent_id: str) -> bool:
        """Delete an agent."""
        if agent_id in self.agents:
            del self.agents[agent_id]
            self._save_agents()
            
            # Also remove from layout
            if "positions" in self.layout and agent_id in self.layout["positions"]:
                del self.layout["positions"][agent_id]
            
            # Remove connections
            self.layout["connections"] = [
                c for c in self.layout.get("connections", [])
                if c["source"] != agent_id and c["target"] != agent_id
            ]
            self._save_layout()
            return True
        return False

    def get_agent(self, agent_id: str) -> Optional[AgentConfig]:
        return self.agents.get(agent_id)

    def get_all_agents(self) -> List[AgentConfig]:
        return list(self.agents.values())

    def update_status(self, agent_id: str, status: str):
        if agent_id in self.agents:
            self.agents[agent_id].status = status
            self._save_agents()

    def save_layout(self, layout_data: Dict[str, Any]):
        """Save canvas layout (positions and connections)."""
        self.layout = layout_data
        self._save_layout()

    def get_layout(self) -> Dict[str, Any]:
        return self.layout
