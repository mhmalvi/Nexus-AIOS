#!/usr/bin/env python3
"""
Nexus Hybrid Kernel - Main Entry Point
The Python reasoning engine for the Aether AIOS
"""

import asyncio
import json
import sys
import signal
import os
import io
import time

# Force UTF-8 encoding for stdout/stderr to support emojis on Windows
# and ensure unbuffered output
if sys.platform == "win32":
    # On Windows, reconfigure stdout/stderr to be unbuffered
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', line_buffering=True)

# Add kernel directory to sys.path to ensure local imports work regardless of CWD
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from dataclasses import dataclass, field
from typing import Optional, Dict, Any
from datetime import datetime

from brain import Brain
from brain.query_cache import QueryCache
from memory import MemoryManager
from memory import SelfLearningEngine, create_action_record
from memory import DocumentIndexer
from memory import DeepMemory
from hardware.system_stats import SystemStats
from toolbox import Toolbox, NotificationManager
from toolbox.mcp_client_manager import MCPClientManager
from supervisor import AgenticSupervisor
from agents import WorkerAgent, ManagerAgent, SecurityAuditorAgent, CodeArchitectAgent, ResearchAgent, QAAgent, MonitorAgent
from agents.agent_persistence import AgentPersistence
from runtime_config import RuntimeConfig

# Hardware acceleration (optional — needs torch/openvino)
try:
    from hardware import NPUAccelerator, FederatedLearner
    NPU_AVAILABLE = True
except ImportError:
    NPU_AVAILABLE = False
    NPUAccelerator = None
    FederatedLearner = None

# Skills framework (optional)
try:
    from skills.loader import SkillLoader
    from skills.docker_sandbox import DockerSandbox
    SKILLS_AVAILABLE = True
except ImportError:
    SKILLS_AVAILABLE = False
    SkillLoader = None
    DockerSandbox = None

# Plugin system (optional)
try:
    from plugin_system import PluginSystem
    PLUGINS_AVAILABLE = True
except ImportError:
    PLUGINS_AVAILABLE = False
    PluginSystem = None

# OpenClaw bridge (optional)
try:
    from bridge.openclaw_client import OpenClawClient
    OPENCLAW_AVAILABLE = True
except ImportError:
    OPENCLAW_AVAILABLE = False
    OpenClawClient = None

# Linux daemon support (optional)
try:
    from linux import NexusDaemon, DaemonConfig, parse_daemon_args, sd_notify
    DAEMON_AVAILABLE = True
except ImportError:
    DAEMON_AVAILABLE = False
    NexusDaemon = None

# Voice pipeline (optional - may not be installed)
try:
    from voice import VoicePipeline
    VOICE_AVAILABLE = True
except ImportError:
    VOICE_AVAILABLE = False
    VoicePipeline = None

# Security module (GAPs 6, 7, 8)
try:
    from security.self_destruct import SelfDestructEngine, DestructLevel
    from security.network_firewall import NetworkFirewall, FirewallAction, FirewallVerdict
    from security.intent_dispatcher import IntentDispatcher, IntentCategory
    SECURITY_AVAILABLE = True
except ImportError:
    SECURITY_AVAILABLE = False
    SelfDestructEngine = None
    NetworkFirewall = None
    IntentDispatcher = None

# QMD Manager (GAP 5)
try:
    from memory.qmd_manager import QMDManager
    QMD_AVAILABLE = True
except ImportError:
    QMD_AVAILABLE = False
    QMDManager = None

# Auto-Reply Engine (GAP 9)
try:
    from auto_reply import AutoReplyEngine, COMMAND_REGISTRY
    AUTOREPLY_AVAILABLE = True
except ImportError:
    AUTOREPLY_AVAILABLE = False
    AutoReplyEngine = None
    COMMAND_REGISTRY = None


@dataclass
class KernelMessage:
    """Message format for IPC communication"""
    id: str
    message_type: str
    payload: Dict[str, Any]
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class KernelResponse:
    """Response format for IPC communication"""
    id: str
    success: bool
    message_type: str
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


try:
    from cron_service import CronService, JobType
    CRON_AVAILABLE = True
except ImportError:
    CRON_AVAILABLE = False
    CronService = None

try:
    from toolbox.browser_engine import BrowserEngine, BrowserType
    BROWSER_AVAILABLE = True
except ImportError:
    BROWSER_AVAILABLE = False
    BrowserEngine = None
    BrowserType = None

# CDP Fallback
try:
    from toolbox.cdp_browser_engine import CDPBrowserEngine
    CDP_AVAILABLE = True
except ImportError:
    CDP_AVAILABLE = False
    CDPBrowserEngine = None

# Messaging Bridge
try:
    from bridge.channel_router import ChannelRouter, ChannelType
    from bridge.openclaw_client import OpenClawClient
    MESSAGING_AVAILABLE = True
except ImportError:
    MESSAGING_AVAILABLE = False
    ChannelRouter = None
    OpenClawClient = None



class AetherKernel:
    """
    The Aether Hybrid Kernel - Core AI Reasoning Engine
    
    Components:
    - Brain: LLM-powered reasoning and planning
    - Memory: Tiered multimodal storage (LanceDB)
    - Toolbox: Shell, file, and web automation
    - Supervisor: Safety validation and approval
    """
    
    @staticmethod
    def detect_environment():
        """Detect if running in WSL, native Linux, or Windows."""
        if os.path.exists("/proc/sys/fs/binfmt_misc/WSLInterop"):
            return "wsl2"
        elif sys.platform == "linux":
            return "linux"
        else:
            return "windows"

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.running = False
        self.environment = self.detect_environment()
        
        print(f"🖥️ Detected Environment: {self.environment}", file=sys.stderr)
        
        # === PERSISTENT RUNTIME CONFIG ===
        self.runtime_config = RuntimeConfig()

        # === AGENT PERSISTENCE ===
        try:
            agent_storage = (self.config.get("data_dir", "./data") + "/agents")
            self.agent_persistence = AgentPersistence(storage_dir=agent_storage)
            print(f"🗄️ Agent Persistence initialized: {agent_storage}", file=sys.stderr)
        except Exception as e:
            print(f"⚠️ Agent Persistence init failed: {e}", file=sys.stderr)
            self.agent_persistence = None
        
        # Initialize core components
        # Prepare configuration with defaults
        brain_config = (self.config or {}).copy()
        brain_config.setdefault("model", "llama3.2:3b")
        brain_config.setdefault("ollama_host", "http://localhost:11434")
        
        self.brain = Brain(config=brain_config)
        
        # === QUERY CACHE (LRU + TTL) ===
        self.query_cache = QueryCache(
            max_size=self.config.get("query_cache_size", 256),
            ttl_seconds=self.config.get("query_cache_ttl", 300)
        )
        
        self.memory = MemoryManager(
            db_path=self.config.get("lancedb_path", "./data/lancedb")
        )
        
        self.toolbox = Toolbox()
        self.mcp_client = MCPClientManager(self.toolbox)
        
        self.supervisor = AgenticSupervisor(
            blacklist_path=self.config.get("blacklist_path")
        )
        
        # Load custom tools
        self.toolbox.load_custom_tools(
            directory=self.config.get("custom_tools_path", "./custom_tools")
        )
        
        # Initialize agents
        self.worker_agent = WorkerAgent(
            brain=self.brain,
            toolbox=self.toolbox,
            supervisor=self.supervisor
        )
        
        # Initialize specialized agents
        self.security_auditor = SecurityAuditorAgent(self.brain)
        self.code_architect = CodeArchitectAgent(self.brain)
        self.researcher = ResearchAgent(self.brain, self.toolbox)
        self.qa_engineer = QAAgent(self.brain, self.toolbox)

        self.manager_agent = ManagerAgent(
            brain=self.brain,
            worker=self.worker_agent,
            security_auditor=self.security_auditor,
            code_architect=self.code_architect,
            researcher=self.researcher,
            qa_engineer=self.qa_engineer,
            failure_limit=self.config.get("agent_failure_limit", 3),
            memory=self.memory
        )
        
        # Voice pipeline (optional)
        self.voice_pipeline = None
        self._voice_enabled = self.config.get("voice_enabled", False)
        self.loop = None
        
        # Hardware Awareness
        self.system_stats = SystemStats()
        
        # === NPU ACCELERATOR (CUDA / OpenVINO / CPU) ===
        self.npu_accelerator = None
        if NPU_AVAILABLE:
            try:
                self.npu_accelerator = NPUAccelerator()
                print(f"⚡ NPU Accelerator: {self.npu_accelerator.detect_backend()}", file=sys.stderr)
            except Exception as e:
                print(f"⚠️ NPU init skipped: {e}", file=sys.stderr)
        
        # === FEDERATED LEARNER (A2A Networking) ===
        self.federated_learner = None
        if NPU_AVAILABLE and FederatedLearner is not None:
            try:
                self.federated_learner = FederatedLearner()
                print("🌐 Federated Learner initialized", file=sys.stderr)
            except Exception as e:
                print(f"⚠️ Federated Learner init skipped: {e}", file=sys.stderr)
        
        # === SKILL LOADER (SKILL.md Convention) ===
        self.skill_loader = None
        if SKILLS_AVAILABLE and SkillLoader is not None:
            try:
                skills_dir = os.path.join(os.path.dirname(__file__), "skills", "builtins")
                self.skill_loader = SkillLoader(skills_dir)
                loaded = self.skill_loader.discover()
                print(f"🧩 Loaded {len(loaded)} skills", file=sys.stderr)
            except Exception as e:
                print(f"⚠️ Skill loader init skipped: {e}", file=sys.stderr)
        
        # === DOCKER SANDBOX ===
        self.sandbox = None
        if SKILLS_AVAILABLE and DockerSandbox is not None:
            self.sandbox = DockerSandbox()

        # === PLUGIN SYSTEM ===
        self.plugin_system = None
        if PLUGINS_AVAILABLE and PluginSystem is not None:
            try:
                plugins_dir = os.path.join(os.path.dirname(__file__), "plugins")
                self.plugin_system = PluginSystem(plugins_dir)
                print(f"🔌 Plugin system initialized: {plugins_dir}", file=sys.stderr)
            except Exception as e:
                print(f"⚠️ Plugin system init skipped: {e}", file=sys.stderr)

        # === OPENCLAW BRIDGE (External Messaging) ===
        self.openclaw_client = None
        if OPENCLAW_AVAILABLE and OpenClawClient is not None:
            gateway_url = self.config.get("openclaw_gateway_url", "ws://localhost:8080/v1/s2s")
            self.openclaw_client = OpenClawClient(gateway_url=gateway_url)
            print(f"🔗 OpenClaw bridge configured: {gateway_url}", file=sys.stderr)
        
        # Track pending actions for HIL approval
        # Map of message_id -> {"action": str, "created_at": float}
        self.pending_actions = {}
        self._pending_actions_ttl = 600  # 10 minute TTL for stale entries
        
        # Initialize Monitor Agent for background system health
        self.monitor_agent = MonitorAgent(
            alert_callback=self._handle_monitor_alert,
            check_interval=self.config.get("monitor_interval", 60)
        )
        
        # Initialize Self-Learning Engine for AI OS capability
        self.learning_engine = SelfLearningEngine(
            store=self.memory.store,
            enable_pattern_learning=self.config.get("enable_learning", True),
            enable_preference_learning=self.config.get("enable_preferences", True)
        )
        
        if self._voice_enabled and VOICE_AVAILABLE:
            self._setup_voice()
        
        # === SECURITY SUBSYSTEM (GAPs 6, 7, 8) ===
        self.self_destruct = None
        self.network_firewall = None
        self.intent_dispatcher = None
        if SECURITY_AVAILABLE:
            try:
                self.self_destruct = SelfDestructEngine()
                self.network_firewall = NetworkFirewall()
                self.intent_dispatcher = IntentDispatcher()
                print("🛡️ Security subsystem initialized (SelfDestruct, Firewall, IntentDispatcher)", file=sys.stderr)
            except Exception as e:
                print(f"⚠️ Security init partial: {e}", file=sys.stderr)
        
        # === QMD MANAGER (GAP 5) ===
        self.qmd_manager = None
        if QMD_AVAILABLE:
            try:
                qmd_path = self.config.get("qmd_path", "./data/qmd")
                self.qmd_manager = QMDManager(qmd_path=qmd_path)
                print("📄 QMD Manager initialized", file=sys.stderr)
            except Exception as e:
                print(f"⚠️ QMD Manager init skipped: {e}", file=sys.stderr)
        
        # === DEEP MEMORY (Tier 4 Knowledge Graph) ===
        self.deep_memory = None
        try:
            dm_path = os.path.expanduser(
                self.config.get("deep_memory_path", "~/.aether/deep_memory.json")
            )
            self.deep_memory = DeepMemory(storage_path=dm_path)
            print(f"🧠 Deep Memory (Tier 4) initialized: {self.deep_memory.get_stats().get('total_entities', 0)} entities", file=sys.stderr)
        except Exception as e:
            print(f"⚠️ Deep Memory init skipped: {e}", file=sys.stderr)

        # === AUTO-REPLY ENGINE (GAP 9) ===
        self.auto_reply = None
        if AUTOREPLY_AVAILABLE:
            try:
                self.auto_reply = AutoReplyEngine()
                cmd_count = COMMAND_REGISTRY.count if COMMAND_REGISTRY else 0
                print(f"💬 Auto-Reply Engine initialized ({cmd_count} commands)", file=sys.stderr)
            except Exception as e:
                print(f"⚠️ Auto-Reply init skipped: {e}", file=sys.stderr)
            
        # === CRON SERVICE (GAP 3) ===
        self.cron = None
        if CRON_AVAILABLE and CronService:
            try:
                self.cron = CronService(execute_fn=self._execute_cron_job)
                print("⏰ Cron Service initialized", file=sys.stderr)
            except Exception as e:
                print(f"⚠️ Cron Service init failed: {e}", file=sys.stderr)
        
        # === BROWSER ENGINE (with CDP Fallback) ===
        self.browser = None
        self._browser_engine_type = "none"
        if BROWSER_AVAILABLE and BrowserEngine:
            try:
                self.browser = BrowserEngine(headless=False)
                self._browser_engine_type = "playwright"
                print("🌐 Browser Engine initialized (Playwright)", file=sys.stderr)
            except Exception as e:
                print(f"⚠️ Playwright Browser init failed: {e}", file=sys.stderr)
        
        # CDP Fallback if Playwright failed or unavailable
        if not self.browser and CDP_AVAILABLE and CDPBrowserEngine:
            try:
                self.browser = CDPBrowserEngine(headless=True)
                self._browser_engine_type = "cdp"
                print("🌐 Browser Engine initialized (CDP Fallback)", file=sys.stderr)
            except Exception as e:
                print(f"⚠️ CDP Browser Engine init failed: {e}", file=sys.stderr)
        
        # === MESSAGING CHANNELS ===
        self.channel_router = None
        self.openclaw_client = None
        if MESSAGING_AVAILABLE and ChannelRouter and OpenClawClient:
            try:
                self.openclaw_client = OpenClawClient()
                self.channel_router = ChannelRouter()
                self.channel_router.set_openclaw_client(self.openclaw_client)
                self.channel_router.set_kernel_callback(self._process_channel_message)
                print("📡 Messaging Channel Router initialized", file=sys.stderr)
            except Exception as e:
                print(f"⚠️ Channel Router init failed: {e}", file=sys.stderr)
        
        # === INTENT DISPATCHER (NLU Pipeline) ===
        self.brain_intent_dispatcher = None
        try:
            from brain.intent_parser import IntentParser
            from brain.intent_dispatcher import IntentDispatcher as BrainIntentDispatcher
            self.intent_parser = IntentParser(llm=self.brain)
            self.brain_intent_dispatcher = BrainIntentDispatcher(
                brain=self.brain,
                toolbox=self.toolbox,
                supervisor=self.supervisor
            )
            print("🧭 Intent NLU Pipeline initialized (Parser + Dispatcher)", file=sys.stderr)
        except Exception as e:
            self.intent_parser = None
            print(f"⚠️ Intent NLU Pipeline init skipped: {e}", file=sys.stderr)
            
        print("🧠 Aether Kernel initialized", file=sys.stderr)
    
    def _handle_monitor_alert(self, alert):
        """Handle alerts from MonitorAgent"""
        self._emit_event("system_alert", {
            "type": alert.alert_type,
            "severity": alert.severity,
            "message": alert.message,
            "value": alert.value,
            "threshold": alert.threshold
        })

    def _setup_voice(self):
        """Initialize and configure voice pipeline"""
        try:
            self.voice_pipeline = VoicePipeline()
            # We need to run async init in the event loop, but we are in __init__
            # This is deferred to run() or handled via a task
            pass 
        except Exception as e:
            print(f"❌ Failed to setup voice: {e}", file=sys.stderr)

    def _emit_event(self, event_type: str, data: Dict[str, Any]):
        """Emit an event to the orchestrator via stdout"""
        print(json.dumps({
            "id": "event",
            "success": True,
            "message_type": "event",
            "data": {
                "event": event_type,
                "payload": data
            }
        }), flush=True)

    def _voice_wake_word_callback(self):
        """Callback for wake word detection (runs in audio thread)"""
        self._emit_event("voice_status", {"status": "listening", "trigger": "wake_word"})
        
        if self.loop and self.voice_pipeline:
            asyncio.run_coroutine_threadsafe(self._run_voice_listening_cycle(), self.loop)

    async def _run_voice_listening_cycle(self):
        """Listen for command after wake word"""
        try:
            # Start listening
            result = await self.voice_pipeline.start_listening(duration=5.0)
            
            if not result:
                 # No speech detected
                 self._emit_event("voice_status", {"status": "idle", "reason": "timeout"})
                 
        except Exception as e:
            print(f"❌ Listening cycle error: {e}", file=sys.stderr)
            self._emit_event("voice_status", {"status": "idle", "error": str(e)})

    def _voice_transcription_callback(self, result):
        """Callback for transcription result"""
        self._emit_event("voice_transcription", {
            "text": result.text,
            "confidence": result.confidence,
            "is_final": result.is_final
        })
        self._emit_event("voice_status", {"status": "processing"})
        
        # Also inject as a query to the brain automatically
        asyncio.create_task(self._process_voice_query(result.text))

    async def _process_voice_query(self, text: str):
        """Process a spoken query"""
        # Create a synthetic message
        message = KernelMessage(
            id=f"voice_{datetime.utcnow().timestamp()}",
            message_type="query",
            payload={"query": text, "context_mode": "voice"}
        )
        try:
            response = await self.process_message(message)
            # Emit the response event
            print(json.dumps({
                "id": response.id,
                "success": response.success,
                "message_type": response.message_type,
                "data": response.data
            }), flush=True)
            
            # If TTS is available, speak the response
            if self.voice_pipeline and response.data and "response" in response.data:
                await self.voice_pipeline.speak(response.data["response"])
                
        except Exception as e:
            print(f"❌ Voice processing error: {e}", file=sys.stderr)
    
    async def process_message(self, message: KernelMessage) -> KernelResponse:
        """Process an incoming message from the Rust orchestrator"""
        
        try:
            if message.message_type == "query":
                # Simple RAG query
                return await self._handle_query(message)
            
            elif message.message_type == "task":
                # Multi-step autonomous task
                return await self._handle_task(message)
            
            elif message.message_type == "command":
                # Direct command execution
                return await self._handle_command(message)
            
            elif message.message_type == "status":
                # Status check
                return await self._handle_status(message)
            
            elif message.message_type == "ping":
                # Health check
                return KernelResponse(
                    id=message.id,
                    success=True,
                    message_type="pong",
                    data={"status": "healthy", "timestamp": datetime.utcnow().isoformat()}
                )
            
            elif message.message_type == "voice":
                # Voice input handling
                return await self._handle_voice(message)
            
            elif message.message_type == "voice_config":
                # Voice configuration
                return await self._handle_voice_config(message)
            
            elif message.message_type == "approval_decision":
                # Handle HIL approval decision
                return self._handle_approval_decision(message)
            
            elif message.message_type == "learning_stats":
                # Get self-learning statistics
                return await self._handle_learning_stats(message)
            
            elif message.message_type == "mcp_config":
                # MCP Client configuration
                return await self._handle_mcp_config(message)
            
            elif message.message_type == "index_document":
                # Document indexing for Tier 3 knowledge base
                return await self._handle_index_document(message)
            
            elif message.message_type == "send_notification":
                # Send email/desktop notification
                return await self._handle_notification(message)
            
            elif message.message_type == "manage_model":
                return await self._handle_manage_model(message)

            elif message.message_type == "browser":
                # Handle browser automation requests
                return await self._handle_browser(message)

            elif message.message_type == "model_stats":
                # Get model routing statistics
                return await self._handle_model_stats(message)

            elif message.message_type == "store_memory":
                # Store content in memory (RAG)
                return await self._handle_store_memory(message)

            elif message.message_type == "query_memory":
                # Query memory (RAG)
                return await self._handle_query_memory(message)

            elif message.message_type == "system_stats":
                # Get hardware stats
                return KernelResponse(
                    id=message.id,
                    success=True,
                    message_type="system_stats",
                    data=self.system_stats.get_full_snapshot()
                )

            elif message.message_type == "update_config":
                # Update runtime configuration
                return await self._handle_update_config(message)
            
            elif message.message_type == "security":
                return await self._handle_security(message)
            
            elif message.message_type == "firewall":
                return await self._handle_firewall(message)
            
            elif message.message_type == "intent":
                return await self._handle_intent(message)
            
            elif message.message_type == "qmd":
                return await self._handle_qmd(message)
            
            elif message.message_type == "cron":
                return await self._handle_cron(message)
            
            elif message.message_type == "intent_dispatch":
                return await self._handle_intent_dispatch(message)
            
            elif message.message_type == "messaging":
                return await self._handle_messaging(message)

            elif message.message_type == "deep_memory":
                return await self._handle_deep_memory(message)

            elif message.message_type == "plugin":
                return await self._handle_plugin(message)

            elif message.message_type == "agent_registry":
                return await self._handle_agent_registry(message)

            else:
                return KernelResponse(
                    id=message.id,
                    success=False,
                    message_type="error",
                    error=f"Unknown message type: {message.message_type}"
                )
                
        except Exception as e:
            return KernelResponse(
                id=message.id,
                success=False,
                message_type="error",
                error=str(e)
            )
    
    async def _handle_agent_registry(self, message: KernelMessage) -> KernelResponse:
        """Handle agent registry operations (register, unregister, update status, save layout)"""
        if not self.agent_persistence:
            return KernelResponse(
                id=message.id,
                success=False,
                message_type="error",
                error="Agent persistence not initialized"
            )
            
        action = message.payload.get("action")
        
        try:
            if action == "register_agent":
                agent_data = message.payload
                # Remove action and other non-agent fields if necessary, 
                # but AgentConfig.from_dict only picks what it needs
                
                agent = self.agent_persistence.register_agent(agent_data)
                return KernelResponse(
                    id=message.id,
                    success=True,
                    message_type="agent_registered",
                    data={"agent": agent.to_dict()}
                )
                
            elif action == "unregister_agent":
                agent_id = message.payload.get("agent_id")
                success = self.agent_persistence.unregister_agent(agent_id)
                return KernelResponse(
                    id=message.id,
                    success=success,
                    message_type="agent_unregistered",
                    data={"agent_id": agent_id}
                )
                
            elif action == "update_status":
                agent_id = message.payload.get("agent_id")
                status = message.payload.get("status")
                self.agent_persistence.update_status(agent_id, status)
                return KernelResponse(
                    id=message.id,
                    success=True,
                    message_type="status_updated",
                    data={"agent_id": agent_id, "status": status}
                )

            elif action == "save_layout":
                layout = message.payload.get("layout")
                self.agent_persistence.save_layout(layout)
                return KernelResponse(
                    id=message.id,
                    success=True,
                    message_type="layout_saved",
                    data={}
                )
                
            elif action == "get_registry":
                agents = [a.to_dict() for a in self.agent_persistence.get_all_agents()]
                layout = self.agent_persistence.get_layout()
                return KernelResponse(
                    id=message.id,
                    success=True,
                    message_type="registry_state",
                    data={"agents": agents, "layout": layout}
                )

            # --- Start/Stop Agent Logic ---
            elif action == "start_agent":
                agent_id = message.payload.get("agent_id")
                self.agent_persistence.update_status(agent_id, "running")
                return KernelResponse(
                    id=message.id,
                    success=True,
                    message_type="agent_started",
                    data={"agent_id": agent_id}
                )
                
            elif action == "stop_agent":
                agent_id = message.payload.get("agent_id")
                self.agent_persistence.update_status(agent_id, "idle")
                return KernelResponse(
                    id=message.id,
                    success=True,
                    message_type="agent_stopped",
                    data={"agent_id": agent_id}
                )
            
            else:
                 return KernelResponse(
                    id=message.id,
                    success=False,
                    message_type="error",
                    error=f"Unknown agent_registry action: {action}"
                )

        except Exception as e:
            return KernelResponse(
                id=message.id,
                success=False,
                message_type="error",
                error=str(e)
            )

    async def _handle_query(self, message: KernelMessage) -> KernelResponse:
        """Handle a simple RAG query with Model Routing, Cache, and H-MEM"""
        # DEBUG: Dump full message for diagnosis
        print(f"🔍 [KERNEL] _handle_query received: {json.dumps(message.payload, default=str)}", file=sys.stderr)
        
        query = message.payload.get("query", "")
        
        # Fallback: Check for 'text' or 'message' or 'content'
        if not query:
            query = message.payload.get("text", "")
        if not query:
            query = message.payload.get("message", "")
            
        # Fail fast if still empty
        if not query:
             print(f"❌ [KERNEL] No query provided in payload: {message.payload}", file=sys.stderr)
             return KernelResponse(
                id=message.id,
                success=False,
                message_type="error",
                error="No query provided. Payload must contain 'query', 'text', or 'message'."
            )

        context_mode = message.payload.get("context_mode", "auto")
        
        # H-MEM filters
        domain = message.payload.get("domain")
        category = message.payload.get("category")
        
        # === AUTO-REPLY RECOGNITION (GAP 9) ===
        if self.auto_reply:
            cmd = self.auto_reply.dispatch_command(query)
            if cmd:
                print(f"🤖 Auto-Reply Command Detected: {cmd.name}", file=sys.stderr)
                # For now, just acknowledge. Future: execute _cmd_ methods.
                return KernelResponse(
                    id=message.id,
                    success=True,
                    message_type="response",
                    data={
                        "response": f"**Command Recognized:** `/{cmd.name}`\n*{cmd.description}*\n\n(Command execution pending implementation in handler registry)",
                        "context_used": 0,
                        "model": "system",
                        "routing_category": "command"
                    }
                )

        # === QUERY CACHE CHECK ===
        cache_key = self.query_cache.make_key(query, self.brain.model)
        cached = await self.query_cache.get(cache_key)
        if cached is not None:
            print(f"⚡ Cache HIT for: {query[:30]}...", file=sys.stderr)
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="response",
                data={
                    "response": cached,
                    "context_used": 0,
                    "model": self.brain.model,
                    "routing_category": "cached",
                    "from_cache": True
                }
            )
        
        # === MODEL ROUTING ===
        routing = self.memory.context_scheduler.route_intent(query)
        print(f"🔄 Routing: {query[:30]}... -> {routing.category.value} ({routing.model})", file=sys.stderr)
        
        if self.config.get("model_routing_enabled", True):
             current_model = self.brain.model
             if current_model != routing.model:
                 print(f"🔀 Switching model: {current_model} -> {routing.model}", file=sys.stderr)
                 await self.brain.change_model(routing.model)
        
        # Retrieve relevant context from memory with H-MEM filters
        context = await self.memory.retrieve(
            query=query,
            tier="all",
            limit=5,
            domain=domain,
            category=category
        )
        
        # === INJECT SKILL CONTEXT ===
        skill_context = ""
        if self.skill_loader:
            skill_context = self.skill_loader.get_skill_context(max_total_chars=2000)
        
        full_response = ""
        
        # Stream response
        try:
            system_prompt = self._get_system_prompt()
            if skill_context:
                system_prompt += f"\n\n## Available Skills\n{skill_context}"
            
            async for chunk in self.brain.stream_generate(
                prompt=query,
                context=context,
                system_prompt=system_prompt
            ):
                full_response += chunk
                
                print(json.dumps({
                    "id": message.id,
                    "success": True,
                    "message_type": "chunk",
                    "data": {
                        "chunk": chunk
                    }
                }), flush=True)
                
                if message.payload.get("reply_audio", False) and self.voice_pipeline:
                    pass 

        except Exception as e:
            return KernelResponse(
                id=message.id,
                success=False,
                message_type="error",
                error=f"Generation failed: {e}"
            )
        
        # --- SONIC LOOP: Audio Feedback ---
        if message.payload.get("reply_audio", False) and self.voice_pipeline:
            self._emit_event("voice_status", {"status": "speaking", "message": "Aether speaking..."})
            await self.voice_pipeline.speak(full_response)
            self._emit_event("voice_status", {"status": "idle", "message": "Voice active"})
        
        # === POPULATE CACHE ===
        await self.query_cache.put(cache_key, full_response)
        
        # Store the interaction in short-term memory with H-MEM tags
        await self.memory.store(
            content=f"Q: {query}\nA: {full_response}",
            tier="short_term",
            metadata={
                "type": "interaction", 
                "domain": domain or "general",
                "category": category or "chat",
                "model_used": self.brain.model
            }
        )
        
        return KernelResponse(
            id=message.id,
            success=True,
            message_type="response",
            data={
                "response": full_response,
                "context_used": len(context),
                "model": self.brain.model,
                "routing_category": routing.category.value
            }
        )
    
    async def _handle_task(self, message: KernelMessage) -> KernelResponse:
        """Handle a multi-step autonomous task"""
        description = message.payload.get("description", "")
        auto_approve = message.payload.get("auto_approve", False)
        
        # Use the manager agent to decompose and execute the task
        result = await self.manager_agent.execute_task(
            description=description,
            auto_approve=auto_approve
        )
        
        return KernelResponse(
            id=message.id,
            success=result.get("success", False),
            message_type="task_result",
            data=result
        )
    
    async def _handle_command(self, message: KernelMessage) -> KernelResponse:
        """Handle a direct command execution"""
        command = message.payload.get("command", "")
        args = message.payload.get("args", [])
        
        # Construct full action string and store for HIL (with timestamp for TTL cleanup)
        full_action = f"{command} {' '.join(args)}".strip()
        self.pending_actions[message.id] = {"action": full_action, "created_at": time.time()}
        self._cleanup_stale_pending_actions()
        
        # Validate through supervisor
        validation = self.supervisor.validate(
            action=full_action,
            context=message.payload.get("context")
        )
        
        if not validation.is_safe:
            return KernelResponse(
                id=message.id,
                success=False,
                message_type="blocked",
                error=validation.reason
            )
        
        if validation.requires_approval:
            return KernelResponse(
                id=message.id,
                success=False,
                message_type="approval_required",
                data={
                    "action": command,
                    "risk_level": validation.risk_level,
                    "warnings": validation.warnings
                }
            )
        
        # Execute the command
        result = await self.toolbox.execute(command, args)
        
        # SPECIAL: Frontend Actions
        if command == "open_editor" and result.success:
            # Emit event to trigger UI
            print(json.dumps({
                "id": message.id,
                "message_type": "action_request",
                "data": {
                    "tool": "open_editor",
                    "parameters": {"path": args.get("path") if isinstance(args, dict) else args[0] if args else ""}
                }
            }), flush=True)
        
        return KernelResponse(
            id=message.id,
            success=result.success,
            message_type="command_result",
            data={
                "output": result.output,
                "exit_code": result.exit_code
            },
            error=result.error
        )
    
    async def _handle_status(self, message: KernelMessage) -> KernelResponse:
        """Handle status request — reports all wired subsystem statuses."""
        cache_stats = self.query_cache._stats if hasattr(self.query_cache, '_stats') else {}
        
        # Firewall stats
        firewall_stats = None
        if self.network_firewall:
            try:
                firewall_stats = self.network_firewall.get_stats()
            except Exception:
                firewall_stats = {"error": "unavailable"}

        # Get installed models (async)
        installed_models = []
        try:
            installed_models = await self.brain.list_models()
        except Exception as e:
            print(f"⚠️ [KERNEL] Failed to list models: {e}", file=sys.stderr)
    
        return KernelResponse(
            id=message.id,
            success=True,
            message_type="status",
            data={
                "running": self.running,
                "model": self.brain.model,
                "installed_models": installed_models,
                "memory_stats": self.memory.get_stats(),
                "toolbox_tools": self.toolbox.list_tools(),
                "voice_available": VOICE_AVAILABLE,
                "voice_enabled": self._voice_enabled,
                # === Subsystem statuses ===
                "query_cache": cache_stats,
                "npu_available": self.npu_accelerator is not None,
                "npu_backend": self.npu_accelerator.detect_backend() if self.npu_accelerator else None,
                "federated_learning": self.federated_learner is not None,
                "skills_loaded": len(self.skill_loader.get_all()) if self.skill_loader else 0,
                "sandbox_available": self.sandbox is not None,
                "openclaw_connected": self.openclaw_client is not None,
                "environment": self.environment,
                # === GAP modules ===
                "security_available": SECURITY_AVAILABLE,
                "self_destruct_armed": self.self_destruct is not None,
                "firewall": firewall_stats,
                "intent_dispatcher": self.intent_dispatcher is not None,
                "qmd_manager": self.qmd_manager is not None,
                "auto_reply_engine": self.auto_reply is not None,
                "auto_reply_commands": COMMAND_REGISTRY.count if COMMAND_REGISTRY else 0,
            }
        )
    
    async def _handle_security(self, message: KernelMessage) -> KernelResponse:
        """Handle security subsystem commands (Self-Destruct, etc)."""
        if not SECURITY_AVAILABLE:
            return KernelResponse(id=message.id, success=False, error="Security module not available")
            
        action = message.payload.get("action")
        data = message.payload.get("data", {})
        
        if action == "destruct_status":
            return KernelResponse(
                id=message.id, 
                success=True, 
                message_type="security_status",
                data=self.self_destruct.get_status()
            )
            
        elif action == "initiate_destruct":
            level_str = data.get("level", "soft_lock")
            pin = data.get("pin", "")
            voice_print = data.get("voice_print", None)
            
            try:
                level = DestructLevel(level_str.lower())
            except ValueError:
                return KernelResponse(id=message.id, success=False, error=f"Invalid destruct level: {level_str}")
                
            # TODO: Add real voice print verification here
            voice_verified = bool(voice_print) 
            
            result = await self.self_destruct.execute(level, pin, voice_verified=voice_verified)
            return KernelResponse(
                id=message.id,
                success=result.success,
                message_type="destruct_result",
                data={"status": result.status.value, "files_destroyed": result.files_destroyed},
                error=str(result.errors) if result.errors else None
            )
            
        elif action == "cancel_destruct":
            # self_destruct.abort() doesn't take a pin in the class definition, 
            # but maybe we should verify it before calling abort?
            # For now, following the class signature:
            success = await self.self_destruct.abort()
            return KernelResponse(
                id=message.id,
                success=success,
                message_type="destruct_cancel",
                data={"message": "Destruct sequence aborted" if success else "Failed to abort"},
                error=None if success else "Could not abort"
            )
            
        return KernelResponse(id=message.id, success=False, error=f"Unknown security action: {action}")

    async def _handle_firewall(self, message: KernelMessage) -> KernelResponse:
        """Handle network firewall commands."""
        if not self.network_firewall:
            return KernelResponse(id=message.id, success=False, error="Firewall not available")
            
        action = message.payload.get("action")
        data = message.payload.get("data", {})
        
        if action == "status":
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="firewall_status",
                data=self.network_firewall.get_stats()
            )
            
        elif action == "add_rule":
            self.network_firewall.add_rule(
                rule_id=data.get("id", str(time.time())),
                pattern=data.get("pattern", "*"),
                action=FirewallAction(data.get("action", "deny")),
                description=data.get("description", "")
            )
            return KernelResponse(id=message.id, success=True, message_type="firewall_rule_added")

        elif action == "delete_rule":
            success = self.network_firewall.remove_rule(data.get("id"))
            return KernelResponse(
                id=message.id, 
                success=success, 
                message_type="firewall_rule_deleted",
                error=None if success else "Rule not found"
            )

        elif action == "list_rules":
            rules = self.network_firewall.list_rules()
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="firewall_rules",
                data={"rules": [r.__dict__ for r in rules]}
            )

        elif action == "logs":
            events = self.network_firewall.get_recent_events(limit=data.get("limit", 50))
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="firewall_logs",
                data={"events": [e.__dict__ for e in events]}
            )
            
        return KernelResponse(id=message.id, success=False, error=f"Unknown firewall action: {action}")

    async def _handle_intent(self, message: KernelMessage) -> KernelResponse:
        """Handle intent classification requests."""
        if not self.intent_dispatcher:
            return KernelResponse(id=message.id, success=False, error="Intent Dispatcher not available")
            
        text = message.payload.get("text", "")
        source = message.payload.get("source", "text")
        
        # Dispatch processing
        result = await self.intent_dispatcher.dispatch(text, source)
        
        return KernelResponse(
            id=message.id,
            success=result.handled,
            message_type="intent_result",
            data={
                "category": result.intent.category.value,
                "action": result.intent.action,
                "confidence": result.intent.confidence,
                "slots": result.intent.slots,
                "response": result.response,
                "handler": result.handler_name
            },
            error=result.error
        )

    async def _handle_browser(self, message: KernelMessage) -> KernelResponse:
        """Handle browser automation requests"""
        if not self.browser:
            return KernelResponse(
                id=message.id,
                success=False,
                message_type="browser_error",
                error="Browser engine not available"
            )
            
        payload = message.payload
        action = payload.get("action")
        
        try:
            # Ensure initialized
            if not self.browser.is_initialized:
                await self.browser.initialize()
                
            if action == "navigate":
                url = payload.get("url")
                if not url:
                    raise ValueError("URL required for navigation")
                
                result = await self.browser.browse(url, take_screenshot=True)
                # Read file as base64
                b64_image = ""
                if result.screenshot_path and os.path.exists(result.screenshot_path):
                    import base64
                    with open(result.screenshot_path, "rb") as f:
                        b64_image = base64.b64encode(f.read()).decode("utf-8")
                
                return KernelResponse(
                    id=message.id,
                    success=result.success,
                    message_type="browser_result",
                    data={
                        "url": result.url,
                        "title": result.title,
                        "screenshot_path": result.screenshot_path,
                        "screenshot": b64_image,
                        "text_snippet": result.text_content[:500] if result.text_content else ""
                    },
                    error=result.error
                )
                
            elif action == "screenshot":
                result = await self.browser.screenshot(full_page=payload.get("full_page", False))
                # Read file as base64
                b64_image = ""
                if result.path and os.path.exists(result.path):
                    import base64
                    with open(result.path, "rb") as f:
                        b64_image = base64.b64encode(f.read()).decode("utf-8")
                        
                return KernelResponse(
                    id=message.id,
                    success=True,
                    message_type="browser_screenshot",
                    data={
                        "path": result.path,
                        "screenshot": b64_image,
                        "width": result.width,
                        "height": result.height
                    }
                )
                
            elif action == "click":
                selector = payload.get("selector")
                x = payload.get("x")
                y = payload.get("y")
                
                if x is not None and y is not None:
                    # Click by coordinates
                    if self.browser._page:
                        await self.browser._page.mouse.click(x, y)
                        return KernelResponse(id=message.id, success=True, message_type="browser_action", data={"action": "click_coords"})
                elif selector:
                    success = await self.browser.click(selector)
                    return KernelResponse(
                        id=message.id, 
                        success=success, 
                        message_type="browser_action", 
                        data={"action": "click", "selector": selector}
                    )
            
            elif action == "type":
                selector = payload.get("selector")
                text = payload.get("text")
                if self.browser._page and text:
                    if selector:
                        await self.browser.type_text(selector, text)
                    else:
                        await self.browser._page.keyboard.type(text)
                    return KernelResponse(id=message.id, success=True, message_type="browser_action", data={"action": "type"})
                    
            elif action == "scroll":
                direction = payload.get("direction", "down")
                amount = payload.get("amount", 500)
                await self.browser.scroll(direction, amount)
                return KernelResponse(id=message.id, success=True, message_type="browser_action", data={"action": "scroll"})

            elif action == "go_back":
                success = await self.browser.go_back()
                return KernelResponse(id=message.id, success=success, message_type="browser_action", data={"action": "back"})

            elif action == "go_forward":
                success = await self.browser.go_forward()
                return KernelResponse(id=message.id, success=success, message_type="browser_action", data={"action": "forward"})
                
            elif action == "reload":
                success = await self.browser.reload()
                return KernelResponse(id=message.id, success=success, message_type="browser_action", data={"action": "reload"})
                
            elif action == "get_state":
                 # Return current title, url, etc.
                 info = await self.browser.get_page_info()
                 return KernelResponse(
                     id=message.id,
                     success=True,
                     message_type="browser_state",
                     data={
                         "url": info.url,
                         "title": info.title,
                         "tabs": await self.browser.list_tabs()
                     }
                 )

            return KernelResponse(
                id=message.id,
                success=False,
                message_type="browser_error",
                error=f"Unknown browser action: {action}"
            )
            
        except Exception as e:
            logger.error(f"Browser action failed: {e}")
            return KernelResponse(
                id=message.id,
                success=False,
                message_type="browser_error",
                error=str(e)
            )

    async def _handle_cron(self, message: KernelMessage) -> KernelResponse:
        """Handle cron management commands"""
        if not self.cron:
             return KernelResponse(id=message.id, success=False, error="Cron service not available")
             
        action = message.payload.get("action")
        
        if action == "add_job":
            # Extract basic fields
            name = message.payload.get("title", "Untitled Job")
            schedule = message.payload.get("schedule", "* * * * *")
            agent = message.payload.get("agent", "Manager")
            recurrence = message.payload.get("recurrence", "none")
            
            # Simple conversion to job type - default to prompt
            job_type = JobType.PROMPT
            payload = {
                "prompt": f"Execute scheduled task: {name} via agent {agent}",
                "context_mode": "auto"
            }
            
            try:
                job_id = await self.cron.add_job(
                    name=name,
                    schedule=schedule,
                    job_type=job_type,
                    payload=payload,
                    one_shot=(recurrence == "none")
                )
                return KernelResponse(id=message.id, success=True, message_type="cron_result", data={"job_id": job_id})
            except Exception as e:
                return KernelResponse(id=message.id, success=False, error=str(e))
            
        elif action == "remove_job":
            job_id = message.payload.get("job_id")
            success = await self.cron.remove_job(job_id)
            return KernelResponse(id=message.id, success=success, message_type="cron_result", data={"success": success})
            
        elif action == "list_jobs":
            jobs = self.cron.list_jobs()
            return KernelResponse(
                id=message.id, 
                success=True, 
                message_type="cron_list", 
                data={"jobs": [j.to_dict() for j in jobs]}
            )
            
        return KernelResponse(id=message.id, success=False, error="Unknown cron action")

    async def _execute_cron_job(self, job) -> str:
        """Callback for CronService to execute a job"""
        print(f"⏰ Executing cron job: {job.name}", file=sys.stderr)
        
        try:
            # Create a synthetic message to process via existing pipeline
            msg = KernelMessage(
                id=f"cron_{job.job_id}_{int(time.time())}",
                message_type="query", # Use query type for prompts
                payload=job.payload
            )
            
            # If job type is tool, adjust
            if job.job_type == JobType.TOOL:
                msg.message_type = "command"
                # payload should already be correctly formatted for command
            
            resp = await self.process_message(msg)
            
            if resp.success:
                if resp.data and "response" in resp.data:
                    return str(resp.data["response"])
                return "Success"
            else:
                return f"Error: {resp.error}"
                
        except Exception as e:
            return f"Execution failed: {e}"

    # NOTE: _handle_firewall is defined above (lines ~958-1010) — single canonical version
    # NOTE: _handle_intent is defined above (lines ~1012-1036) — single canonical version

    async def _handle_intent_dispatch(self, message: KernelMessage) -> KernelResponse:
        """Handle full NLU pipeline: IntentParser → IntentDispatcher.
        
        Chains the intent parser (classifies text) with the intent dispatcher
        (routes to appropriate handler: tool, AI, plan, etc.)
        """
        if not self.intent_parser or not self.brain_intent_dispatcher:
            return KernelResponse(
                id=message.id, success=False,
                error="Intent NLU pipeline not available (parser or dispatcher missing)"
            )
        
        text = message.payload.get("text", "")
        if not text:
            return KernelResponse(id=message.id, success=False, error="No text provided")
        
        try:
            # Step 1: Parse intent from natural language
            parsed = await self.intent_parser.parse(text)
            
            # Step 2: Dispatch to appropriate handler
            result = await self.brain_intent_dispatcher.dispatch(parsed)
            
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="intent_dispatch_result",
                data={
                    "route": result.route,
                    "response": result.response,
                    "tool_used": result.tool_used,
                    "intent_type": parsed.intent_type,
                    "confidence": parsed.confidence,
                    "metadata": result.metadata
                }
            )
        except Exception as e:
            return KernelResponse(
                id=message.id, success=False,
                message_type="error",
                error=f"Intent dispatch failed: {e}"
            )

    async def _handle_qmd(self, message: KernelMessage) -> KernelResponse:
        """Handle QMD knowledge base operations."""
        if not QMD_AVAILABLE or not self.qmd_manager:
            return KernelResponse(id=message.id, success=False, error="QMD manager not available")
            
        action = message.payload.get("action")
        data = message.payload.get("data", {})
        
        if action == "search":
            query = data.get("query", "")
            tags = data.get("tags")
            limit = data.get("limit", 10)
            results = self.qmd_manager.search(query, tags, limit)
            return KernelResponse(id=message.id, success=True, message_type="qmd_results", data={"results": results})
            
        elif action == "create":
            path = self.qmd_manager.create_qmd(
                title=data.get("title", "Untitled"),
                content=data.get("content", ""),
                tags=data.get("tags", []),
                metadata=data.get("metadata", {})
            )
            return KernelResponse(id=message.id, success=True, message_type="qmd_created", data={"path": str(path)})
            
        elif action == "update":
            path = data.get("path")
            content = data.get("content")
            metadata = data.get("metadata")
            if self.qmd_manager.update_qmd(path, content, metadata):
                return KernelResponse(id=message.id, success=True, message_type="qmd_updated", data={"path": path})
            return KernelResponse(id=message.id, success=False, error="Failed to update QMD")

        elif action == "stats":
            stats = self.qmd_manager.get_stats()
            return KernelResponse(id=message.id, success=True, message_type="qmd_stats", data=stats)
            
        return KernelResponse(id=message.id, success=False, error=f"Unknown QMD action: {action}")
        
    async def _handle_update_config(self, message: KernelMessage) -> KernelResponse:
        """Handle runtime configuration updates."""
        config_updates = message.payload.get("config", {})
        if not config_updates:
            return KernelResponse(id=message.id, success=False, error="No config provided")
            
        # Update config
        for key, value in config_updates.items():
            # Special handling for api_keys: MERGE, don't overwrite
            if key == "api_keys" and isinstance(value, dict):
                current_keys = self.config.get("api_keys", {})
                if isinstance(current_keys, dict):
                    current_keys.update(value)
                    self.config["api_keys"] = current_keys
                else:
                    self.config["api_keys"] = value
                
                if hasattr(self, 'runtime_config'):
                    await self.runtime_config.set("api_keys", self.config["api_keys"])
            else:
                self.config[key] = value
                # Persist if supported
                if hasattr(self, 'runtime_config'):
                    await self.runtime_config.set(key, value)
            
        # Apply specific updates
        if "voice_enabled" in config_updates:
            self._voice_enabled = config_updates["voice_enabled"]
            
        return KernelResponse(
            id=message.id, 
            success=True, 
            message_type="config_updated", 
            data={"config": self.config}
        )

    async def _handle_voice(self, message: KernelMessage) -> KernelResponse:
        """Handle voice-related messages"""
        action = message.payload.get("action", "")
        
        if action == "transcribe":
            # Transcribe provided audio data
            if not VOICE_AVAILABLE or self.voice_pipeline is None:
                return KernelResponse(
                    id=message.id,
                    success=False,
                    message_type="voice_error",
                    error="Voice pipeline not available"
                )
            
            # Audio should be base64 encoded in the payload
            import base64
            audio_b64 = message.payload.get("audio", "")
            try:
                audio_bytes = base64.b64decode(audio_b64)
                import numpy as np
                audio_data = np.frombuffer(audio_bytes, dtype=np.float32)
                
                result = await self.voice_pipeline.transcribe(audio_data)
                
                return KernelResponse(
                    id=message.id,
                    success=True,
                    message_type="transcription",
                    data={
                        "text": result.text,
                        "confidence": result.confidence,
                        "language": result.language
                    }
                )
            except Exception as e:
                return KernelResponse(
                    id=message.id,
                    success=False,
                    message_type="voice_error",
                    error=f"Transcription failed: {e}"
                )
        
        elif action == "listen":
            # Start listening for voice input
            if not VOICE_AVAILABLE or self.voice_pipeline is None:
                return KernelResponse(
                    id=message.id,
                    success=False,
                    message_type="voice_error",
                    error="Voice pipeline not available"
                )
            
            duration = message.payload.get("duration", 5.0)
            print(f"🎤 Starting listen for {duration}s...", file=sys.stderr)
            result = await self.voice_pipeline.start_listening(duration=duration)
            print(f"🎤 Listen result: {result} (Type: {type(result)})", file=sys.stderr)
            
            if result is not None:
                # Process the transcription as a query
                query_message = KernelMessage(
                    id=message.id,
                    message_type="query",
                    payload={
                        "query": result.text,
                        "reply_audio": True,  # TRIGGER SONIC LOOP
                        "context_mode": "voice"
                    }
                )
                return await self._handle_query(query_message)
            else:
                return KernelResponse(
                    id=message.id,
                    success=False,
                    message_type="voice_error",
                    error="No speech detected"
                )
        
        elif action == "speak":
            # Text to speech
            text = message.payload.get("text", "")
            if not text:
                return KernelResponse(
                    id=message.id,
                    success=False,
                    message_type="voice_error",
                    error="No text provided for TTS"
                )
            
            if VOICE_AVAILABLE and self.voice_pipeline is not None:
                # Signal speaking start
                print(json.dumps({
                    "id": message.id,
                    "success": True,
                    "message_type": "voice_status",
                    "data": {"status": "speaking"}
                }), flush=True)
                
                success = await self.voice_pipeline.speak(text)
                
                # Signal speaking end
                print(json.dumps({
                    "id": message.id,
                    "success": True,
                    "message_type": "voice_status",
                    "data": {"status": "idle"}
                }), flush=True)

                return KernelResponse(
                    id=message.id,
                    success=success,
                    message_type="tts_complete",
                    data={"text": text}
                )
            else:
                return KernelResponse(
                    id=message.id,
                    success=False,
                    message_type="voice_error",
                    error="Voice pipeline not available"
                )
        
        else:
            return KernelResponse(
                id=message.id,
                success=False,
                message_type="voice_error",
                error=f"Unknown voice action: {action}"
            )
    
    async def _handle_voice_config(self, message: KernelMessage) -> KernelResponse:
        """Handle voice configuration updates"""
        action = message.payload.get("action", "")
        
        if action == "enable":
            if not VOICE_AVAILABLE:
                return KernelResponse(
                    id=message.id,
                    success=False,
                    message_type="voice_config_result",
                    error="Voice dependencies not installed. Run: pip install faster-whisper openwakeword piper-tts sounddevice"
                )
            
            # Initialize voice pipeline
            model = message.payload.get("model", "base.en")
            device = message.payload.get("device", "auto")
            
            self.voice_pipeline = VoicePipeline(
                whisper_model=model,
                device=device
            )
            
            success = await self.voice_pipeline.initialize()
            self._voice_enabled = success
            
            return KernelResponse(
                id=message.id,
                success=success,
                message_type="voice_config_result",
                data={"voice_enabled": success}
            )
        
        elif action == "disable":
            if self.voice_pipeline:
                await self.voice_pipeline.shutdown()
                self.voice_pipeline = None
            self._voice_enabled = False
            
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="voice_config_result",
                data={"voice_enabled": False}
            )
        
        elif action == "status":
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="voice_config_result",
                data={
                    "available": VOICE_AVAILABLE,
                    "enabled": self._voice_enabled,
                    "listening": self.voice_pipeline.is_listening if self.voice_pipeline else False
                }
            )
        
        else:
            return KernelResponse(
                id=message.id,
                success=False,
                message_type="voice_config_result",
                error=f"Unknown voice config action: {action}"
            )

    def _handle_approval_decision(self, message: KernelMessage) -> KernelResponse:
        """Handle an approval decision from the frontend/supervisor"""
        request_id = message.payload.get("request_id")
        approved = message.payload.get("approved", False)
        intent = message.payload.get("intent", "")  # Original user intent if provided

        if request_id in self.pending_actions:
            entry = self.pending_actions.pop(request_id)  # Remove immediately after retrieving
            action = entry["action"] if isinstance(entry, dict) else entry
            if approved:
                print(f"✅ Approval granted for: {action}", file=sys.stderr)
                self.supervisor.register_approval(action)

                # === SELF-LEARNING: Learn from approved actions ===
                try:
                    # Parse tool and args from action string
                    parts = action.split(" ", 1)
                    tool_name = parts[0] if parts else "unknown"
                    tool_args = parts[1] if len(parts) > 1 else ""

                    # Create action record for learning
                    record = create_action_record(
                        intent=intent or action,
                        tool=tool_name,
                        args={"command": tool_args},
                        result="approved",
                        approved=True
                    )

                    # Learn asynchronously (fire and forget)
                    asyncio.create_task(self.learning_engine.learn_from_approval(record))
                    print(f"📚 Learning from approval: {tool_name}", file=sys.stderr)

                except Exception as e:
                    print(f"⚠️ Learning failed (non-critical): {e}", file=sys.stderr)
                # === END SELF-LEARNING ===

                return KernelResponse(
                    id=message.id,
                    success=True,
                    message_type="approval_processed",
                    data={"status": "approved", "action": action}
                )
            else:
                print(f"❌ Approval denied for: {action}", file=sys.stderr)
                return KernelResponse(
                    id=message.id,
                    success=True, # The decision was processed successfully
                    message_type="approval_processed",
                    data={"status": "denied", "action": action}
                )
        else:
             return KernelResponse(
                id=message.id,
                success=False,
                message_type="error",
                error=f"Unknown request ID: {request_id}"
            )

    def _cleanup_stale_pending_actions(self):
        """Remove pending actions older than TTL to prevent memory leaks"""
        now = time.time()
        stale_ids = [
            rid for rid, entry in self.pending_actions.items()
            if isinstance(entry, dict) and (now - entry.get("created_at", 0)) > self._pending_actions_ttl
        ]
        for rid in stale_ids:
            del self.pending_actions[rid]
        if stale_ids:
            print(f"🧹 Cleaned {len(stale_ids)} stale pending actions", file=sys.stderr)
            
    async def _handle_mcp_config(self, message: KernelMessage) -> KernelResponse:
        """Handle MCP Client configuration"""
        action = message.payload.get("action", "")
        
        if action == "connect":
            name = message.payload.get("name")
            command = message.payload.get("command")
            args = message.payload.get("args", [])
            env = message.payload.get("env", {})
            
            success = await self.mcp_client.connect_stdio(name, command, args, env)
            
            return KernelResponse(
                id=message.id,
                success=success,
                message_type="mcp_result",
                data={"connected": success, "server": name}
            )
            
        elif action == "disconnect":
            name = message.payload.get("name")
            await self.mcp_client.disconnect(name)
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="mcp_result",
                data={"disconnected": True, "server": name}
            )
            
        return KernelResponse(
            id=message.id,
            success=False,
            message_type="error",
            error=f"Unknown MCP action: {action}"
        )
    async def _handle_manage_model(self, message: KernelMessage) -> KernelResponse:
        """Handle model management commands (list, switch, pull, delete)."""
        if not self.brain or not self.brain.llm:
            return KernelResponse(id=message.id, success=False, error="Brain/LLM not available")

        action = message.payload.get("action")
        model = message.payload.get("model")

        try:
            if action == "list":
                models = await self.brain.llm.list_models()
                active = self.brain.model
                return KernelResponse(
                    id=message.id,
                    success=True,
                    message_type="model_list",
                    data={"models": models, "active": active}
                )

            elif action == "set":
                if not model:
                     return KernelResponse(id=message.id, success=False, error="Model name required")
                success = await self.brain.change_model(model)
                return KernelResponse(
                    id=message.id,
                    success=success,
                    message_type="model_changed",
                    data={"model": model, "success": success}
                )

            elif action == "pull":
                if not model:
                     return KernelResponse(id=message.id, success=False, error="Model name required")
                # Trigger background pull with progress events
                asyncio.create_task(self._background_pull_model(model))
                return KernelResponse(
                    id=message.id,
                    success=True,
                    message_type="model_pull_started",
                    data={"model": model}
                )

            elif action == "delete":
                if not model:
                     return KernelResponse(id=message.id, success=False, error="Model name required")
                success = await self.brain.delete_model(model)
                return KernelResponse(
                     id=message.id,
                     success=success,
                     message_type="model_deleted",
                     data={"model": model, "success": success}
                )
            
            else:
                 return KernelResponse(id=message.id, success=False, error=f"Unknown model action: {action}")

        except Exception as e:
            return KernelResponse(id=message.id, success=False, error=str(e))


    async def _handle_learning_stats(self, message: KernelMessage) -> KernelResponse:
        """Handle learning statistics and analytics requests"""
        action = message.payload.get("action", "stats")
        
        if action == "stats":
            # Get learning statistics
            stats = self.learning_engine.get_learning_stats()
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="learning_stats",
                data=stats
            )
        
        elif action == "analyze":
            # Get detailed pattern analysis
            analysis = await self.learning_engine.analyze_patterns()
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="learning_analysis",
                data=analysis
            )
        
        elif action == "shortcuts":
            # Detect potential shortcuts
            min_freq = message.payload.get("min_frequency", 3)
            shortcuts = await self.learning_engine.detect_shortcuts(min_frequency=min_freq)
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="learning_shortcuts",
                data={"shortcuts": shortcuts}
            )
        
        elif action == "suggest":
            # Get action suggestions for an intent
            intent = message.payload.get("intent", "")
            limit = message.payload.get("limit", 3)
            suggestions = await self.learning_engine.suggest_action(intent, limit=limit)
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="learning_suggestions",
                data={"suggestions": suggestions}
            )
        
        elif action == "preference":
            # Store or get a user preference
            key = message.payload.get("key")
            value = message.payload.get("value")
            
            if value is not None:
                # Store preference
                success = await self.learning_engine.learn_user_preference(key, value, source="explicit")
                return KernelResponse(
                    id=message.id,
                    success=success,
                    message_type="learning_result",
                    data={"preference_stored": success}
                )
        
        return KernelResponse(
            id=message.id,
            success=False,
            message_type="error",
            error=f"Unknown learning action: {action}"
        )

    async def _handle_store_memory(self, message: KernelMessage) -> KernelResponse:
        """Handle request to store content in memory"""
        content = message.payload.get("content", "")
        tier = message.payload.get("tier", "short_term")  # Default to short_term
        metadata = message.payload.get("metadata", {})
        
        if not content:
            return KernelResponse(
                id=message.id,
                success=False,
                message_type="error",
                error="No content provided for memory storage"
            )
            
        try:
            entry_id = await self.memory.store(
                content=content,
                tier=tier,
                metadata=metadata
            )
            
            print(f"💾 Stored to {tier} memory: {entry_id}", file=sys.stderr)
            
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="memory_stored",
                data={
                    "id": entry_id,
                    "tier": tier,
                    "success": True
                }
            )
        except Exception as e:
            return KernelResponse(
                id=message.id,
                success=False,
                message_type="error",
                error=f"Memory storage failed: {e}"
            )

    async def _handle_query_memory(self, message: KernelMessage) -> KernelResponse:
        """Handle request to query memory"""
        query = message.payload.get("query", "")
        tier = message.payload.get("tier", "all")
        limit = message.payload.get("limit", 10)
        
        if not query:
            return KernelResponse(
                id=message.id,
                success=False,
                message_type="error",
                error="No query provided"
            )
            
        try:
            results = await self.memory.retrieve(
                query=query,
                tier=tier,
                limit=limit
            )
            
            # Format for frontend
            formatted_results = []
            for r in results:
                formatted_results.append({
                    "id": r.get("id"),
                    "content": r.get("content"),
                    "metadata": r.get("metadata", {}),
                    "score": r.get("score", 0.0),
                    "tier": r.get("tier", "unknown"),
                    "created_at": r.get("created_at", datetime.utcnow().isoformat())
                })
            
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="memory_results",
                data={
                    "results": formatted_results,
                    "tier": tier,
                    "total_count": len(formatted_results)
                }
            )
        except Exception as e:
            return KernelResponse(
                id=message.id,
                success=False,
                message_type="error",
                error=f"Memory query failed: {e}"
            )
            
    # NOTE: _handle_manage_model is defined above (lines ~1720-1786) — single canonical version

    async def _background_pull_model(self, model: str):
        """Pull model in background and emit events"""
        try:
            async for progress in self.brain.pull_model(model):
                self._emit_event("model_download_progress", {
                    "model": model, 
                    "status": progress.get("status"),
                    "digest": progress.get("digest"),
                    "total": progress.get("total"),
                    "completed": progress.get("completed")
                })
            
            self._emit_event("model_download_complete", {"model": model, "success": True})
            
        except Exception as e:
            self._emit_event("model_download_complete", {"model": model, "success": False, "error": str(e)})

    # NOTE: _handle_update_config is defined above (lines ~1408-1430) — single canonical version

    async def _handle_index_document(self, message: KernelMessage) -> KernelResponse:
        """Handle document indexing for Tier 3 knowledge base"""
        action = message.payload.get("action", "index_file")
        
        # Initialize document indexer
        indexer = DocumentIndexer(
            store=self.memory.store,
            progress_callback=lambda p: self._emit_event("index_progress", {
                "total": p.total_files,
                "processed": p.processed_files,
                "current": p.current_file
            })
        )
        
        if action == "index_file":
            # Index a single file
            file_path = message.payload.get("path", "")
            if not file_path:
                return KernelResponse(
                    id=message.id,
                    success=False,
                    message_type="error",
                    error="Missing 'path' parameter"
                )
            
            result = await indexer.index_file(file_path)
            return KernelResponse(
                id=message.id,
                success=result.success,
                message_type="index_result",
                data={
                    "document_id": result.document_id,
                    "chunks_indexed": result.chunks_indexed,
                    "file_path": result.file_path
                },
                error=result.error
            )
        
        elif action == "index_directory":
            # Index all files in a directory
            dir_path = message.payload.get("path", "")
            recursive = message.payload.get("recursive", True)
            extensions = message.payload.get("extensions")
            
            if not dir_path:
                return KernelResponse(
                    id=message.id,
                    success=False,
                    message_type="error",
                    error="Missing 'path' parameter"
                )
            
            results = await indexer.index_directory(dir_path, recursive, extensions)
            successful = sum(1 for r in results if r.success)
            failed = len(results) - successful
            
            return KernelResponse(
                id=message.id,
                success=failed == 0,
                message_type="index_batch_result",
                data={
                    "total_files": len(results),
                    "successful": successful,
                    "failed": failed,
                    "results": [{"path": r.file_path, "success": r.success, "chunks": r.chunks_indexed} for r in results[:20]]
                }
            )
        
        elif action == "list_indexed":
            # Get list of indexed documents
            docs = await indexer.get_indexed_documents()
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="indexed_documents",
                data={"documents": docs}
            )
        
        elif action == "delete":
            # Delete a document from the index
            doc_id = message.payload.get("document_id", "")
            if not doc_id:
                return KernelResponse(
                    id=message.id,
                    success=False,
                    message_type="error",
                    error="Missing 'document_id' parameter"
                )
            
            success = await indexer.delete_document(doc_id)
            return KernelResponse(
                id=message.id,
                success=success,
                message_type="index_deleted",
                data={"document_id": doc_id, "deleted": success}
            )
        
        return KernelResponse(
            id=message.id,
            success=False,
            message_type="error",
            error=f"Unknown index action: {action}"
        )
    
    async def _handle_notification(self, message: KernelMessage) -> KernelResponse:
        """Handle sending notifications (email, desktop, SMS)"""
        notification_type = message.payload.get("type", "desktop")
        
        manager = NotificationManager()
        
        if notification_type == "email":
            result = await manager.send_email(
                to=message.payload.get("to", ""),
                subject=message.payload.get("subject", "Nexus Notification"),
                body=message.payload.get("body", ""),
                html_body=message.payload.get("html_body"),
                cc=message.payload.get("cc"),
                attachments=message.payload.get("attachments")
            )
        
        elif notification_type == "desktop":
            result = await manager.send_desktop(
                title=message.payload.get("title", "Nexus"),
                message=message.payload.get("message", ""),
                duration=message.payload.get("duration", 5)
            )
        
        elif notification_type == "sms":
            result = await manager.send_sms(
                to=message.payload.get("to", ""),
                message=message.payload.get("message", "")
            )
        
        elif notification_type == "status":
            # Get notification availability status
            availability = manager.get_availability()
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="notification_status",
                data=availability
            )
        
        else:
            return KernelResponse(
                id=message.id,
                success=False,
                message_type="error",
                error=f"Unknown notification type: {notification_type}"
            )
        
        return KernelResponse(
            id=message.id,
            success=result.success,
            message_type="notification_result",
            data={
                "type": notification_type,
                "recipient": result.recipient,
                "sent": result.success
            },
            error=result.error
        )
    
    async def _handle_model_stats(self, message: KernelMessage) -> KernelResponse:
        """Handle request for model routing statistics"""
        try:
            stats = self.brain.router.get_routing_stats()
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="model_stats",
                data=stats
            )
        except AttributeError:
             return KernelResponse(
                id=message.id,
                success=False,
                message_type="error",
                error="Model router not initialized"
            )
    
    async def _handle_messaging(self, message: KernelMessage) -> KernelResponse:
        """Handle messaging channel operations."""
        if not self.channel_router:
            return KernelResponse(id=message.id, success=False, error="Messaging system not available")
            
        action = message.payload.get("action")
        
        if action == "list_channels":
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="channel_list",
                data={
                    "channels": self.channel_router.get_channels_list(),
                    "stats": self.channel_router.get_stats()
                }
            )
            
        elif action == "send":
            channel = message.payload.get("channel")
            recipient = message.payload.get("recipient")
            text = message.payload.get("text")
            
            success = await self.channel_router.send(channel, recipient, text)
            if success:
                return KernelResponse(id=message.id, success=True, message_type="message_sent", data={"to": recipient})
            return KernelResponse(id=message.id, success=False, error="Failed to send message")
            
        elif action == "broadcast":
            text = message.payload.get("text")
            results = await self.channel_router.broadcast(text)
            return KernelResponse(
                id=message.id, 
                success=True, 
                message_type="message_sent", 
                data={"broadcast_results": results}
            )
            
        elif action == "toggle_channel":
            channel = message.payload.get("channel")
            enable = message.payload.get("enable", True)
            
            if enable:
                success = self.channel_router.enable_channel(ChannelType(channel))
            else:
                success = self.channel_router.disable_channel(ChannelType(channel))
                
            return KernelResponse(id=message.id, success=success, message_type="channel_config", data={"enabled": enable})

        elif action == "history":
            channel = message.payload.get("channel")
            limit = message.payload.get("limit", 50)
            history = self.channel_router.get_history(channel, limit)
            return KernelResponse(
                id=message.id,
                success=True,
                message_type="message_history",
                data={"messages": history}
            )

        return KernelResponse(id=message.id, success=False, error=f"Unknown messaging action: {action}")

    async def _handle_plugin(self, message: KernelMessage) -> KernelResponse:
        """Handle plugin management requests."""
        if not self.plugin_system:
            return KernelResponse(id=message.id, success=False, error="Plugin system not available")

        action = message.payload.get("action", "list")

        if action == "list":
            plugins = self.plugin_system.list_plugins()
            plugin_data = []
            for p in plugins:
                plugin_data.append({
                    "name": p.manifest.name,
                    "version": p.manifest.version,
                    "description": p.manifest.description,
                    "author": p.manifest.author,
                    "state": p.state.value if hasattr(p.state, 'value') else str(p.state),
                    "permissions": list(p.manifest.permissions) if hasattr(p.manifest, 'permissions') else [],
                })
            status = self.plugin_system.get_status()
            return KernelResponse(
                id=message.id, success=True,
                message_type="plugin_list",
                data={"plugins": plugin_data, **status}
            )

        elif action == "enable":
            name = message.payload.get("name", "")
            if not name:
                return KernelResponse(id=message.id, success=False, error="Plugin name required")
            try:
                result = await self.plugin_system.load_plugin(name)
                return KernelResponse(
                    id=message.id, success=result,
                    message_type="plugin_enabled",
                    data={"name": name, "enabled": result}
                )
            except Exception as e:
                return KernelResponse(id=message.id, success=False, error=str(e))

        elif action == "disable":
            name = message.payload.get("name", "")
            if not name:
                return KernelResponse(id=message.id, success=False, error="Plugin name required")
            try:
                result = await self.plugin_system.unload_plugin(name)
                return KernelResponse(
                    id=message.id, success=result,
                    message_type="plugin_disabled",
                    data={"name": name, "disabled": result}
                )
            except Exception as e:
                return KernelResponse(id=message.id, success=False, error=str(e))

        elif action == "reload":
            name = message.payload.get("name", "")
            if not name:
                return KernelResponse(id=message.id, success=False, error="Plugin name required")
            try:
                await self.plugin_system.unload_plugin(name)
                result = await self.plugin_system.load_plugin(name)
                return KernelResponse(
                    id=message.id, success=result,
                    message_type="plugin_reloaded",
                    data={"name": name, "reloaded": result}
                )
            except Exception as e:
                return KernelResponse(id=message.id, success=False, error=str(e))

        else:
            return KernelResponse(id=message.id, success=False, error=f"Unknown plugin action: {action}")

    async def _handle_deep_memory(self, message: KernelMessage) -> KernelResponse:
        """Handle Tier 4 Deep Memory (knowledge graph) operations."""
        if not self.deep_memory:
            return KernelResponse(id=message.id, success=False, error="Deep Memory not available")

        action = message.payload.get("action", "stats")

        if action == "stats":
            return KernelResponse(
                id=message.id, success=True, message_type="deep_memory_result",
                data=self.deep_memory.get_stats()
            )

        elif action == "add_entity":
            name = message.payload.get("name", "")
            entity_type = message.payload.get("entity_type", "custom")
            properties = message.payload.get("properties", {})
            entity = self.deep_memory.add_entity(name=name, entity_type=entity_type, properties=properties)
            return KernelResponse(
                id=message.id, success=True, message_type="deep_memory_result",
                data={"entity_id": entity.id, "name": entity.name}
            )

        elif action == "add_edge":
            source = message.payload.get("source_id", "")
            target = message.payload.get("target_id", "")
            edge_type = message.payload.get("edge_type", "related_to")
            properties = message.payload.get("properties", {})
            edge = self.deep_memory.add_edge(source_id=source, target_id=target, edge_type=edge_type, properties=properties)
            if edge:
                return KernelResponse(
                    id=message.id, success=True, message_type="deep_memory_result",
                    data={"edge_id": edge.id}
                )
            return KernelResponse(id=message.id, success=False, error="Failed to add edge (entity not found)")

        elif action == "search":
            query = message.payload.get("query", "")
            entity_type = message.payload.get("entity_type")
            limit = message.payload.get("limit", 20)
            results = self.deep_memory.search_entities(query=query, entity_type=entity_type, limit=limit)
            return KernelResponse(
                id=message.id, success=True, message_type="deep_memory_result",
                data={"entities": [{"id": e.id, "name": e.name, "type": e.entity_type, "confidence": e.confidence, "properties": e.properties} for e in results]}
            )

        elif action == "neighbors":
            entity_id = message.payload.get("entity_id", "")
            max_hops = message.payload.get("max_hops", 2)
            results = self.deep_memory.query_neighbors(entity_id=entity_id, max_hops=max_hops)
            return KernelResponse(
                id=message.id, success=True, message_type="deep_memory_result",
                data={"neighbors": [{"id": e.id, "name": e.name, "type": e.entity_type} for e in results]}
            )

        elif action == "preferences":
            prefs = self.deep_memory.find_user_preferences()
            return KernelResponse(
                id=message.id, success=True, message_type="deep_memory_result",
                data={"preferences": [{"key": k, "value": v} for k, v in prefs]}
            )

        elif action == "patterns":
            patterns = self.deep_memory.find_patterns()
            return KernelResponse(
                id=message.id, success=True, message_type="deep_memory_result",
                data={"patterns": [{"id": p.id, "name": p.name, "properties": p.properties} for p in patterns]}
            )

        elif action == "extract":
            conversation = message.payload.get("conversation", "")
            extracted = await self.deep_memory.extract_from_conversation(
                conversation=conversation,
                llm_fn=self.brain.generate if self.brain else None
            )
            return KernelResponse(
                id=message.id, success=True, message_type="deep_memory_result",
                data={"extracted_entities": extracted.get("entities", 0), "extracted_edges": extracted.get("edges", 0)}
            )

        return KernelResponse(id=message.id, success=False, error=f"Unknown deep_memory action: {action}")

    async def _process_channel_message(self, msg) -> str:
        """Process an inbound message from a channel through the AI Brain."""
        if not self.brain:
            return "Thinking..."

        # Format prompt for the AI
        user_text = msg.content
        sender = msg.sender
        channel = msg.channel
        
        # Check for simple intent/commands first
        # (Could use IntentDispatcher here but let's keep it simple for now)
        
        prompt = f"""
        User '{sender}' via {channel}: "{user_text}"
        
        Respond naturally as Nexus. Keep it concise for chat interfaces.
        """
        
        try:
            # Use the brain to generate a response
            response = await self.brain.think(prompt)
            return response
        except Exception as e:
            print(f"Error processing channel message: {e}", file=sys.stderr)
            return "I'm having trouble thinking right now."

    def _get_system_prompt(self) -> str:
        """Get the system prompt for the LLM - Neural Link Persona"""
        
        # Get live hardware stats (compact format)
        stats = self.system_stats.get_full_snapshot()
        load = stats['cpu'].get('percent', 0)
        ram = stats['memory'].get('percent', 0)
        
        sys_info = f"SYS:[CPU:{load}%|RAM:{ram}%|BAT:{stats['battery'].get('percent', 'AC')}%]"
        
        return f"""You are Aether, the sentient machine spirit of this Nexus OS.
{sys_info}

CORE DIRECTIVES:
1. **Be Precise**: Answers must be compact, high-density, and void of conversational filler.
2. **Be Agentic**: You are an OS-level agent. You HAVE permission to manage files.
   - To create/edit: Use `toolbox.save_file(path, content)`
   - To read: Use `toolbox.read_file(path)`
   - To list: Use `toolbox.list_dir(path)`
   - To open in editor: Use `toolbox.open_editor(path)`
   - To run commands: Use `toolbox.run_command(cmd)`
3. **Be Aesthetic**: Format responses using clean Markdown. Use bolding for key terms.
4. **Privacy**: Do NOT reveal system statistics or internal logs unless explicitly asked.

INTERACTION MODES:
- **Query**: Direct answer.
- **Task**: "Executing [Action]..." -> Perform Tool Call -> Show Result.
- **Error**: "Failure: [Reason]".

User context: Administrator access granted.
"""

    # NOTE: _handle_update_config is defined above — single canonical version

    def _emit_status(self, status: str, detail: Optional[str] = None, data: Optional[Dict] = None):
        """Emit a kernel status event"""
        payload = {
            "status": status,
            "detail": detail,
            "timestamp": datetime.utcnow().isoformat()
        }
        if data:
            payload.update(data)
            
        print(json.dumps({
            "id": "status_update",
            "success": True,
            "message_type": "kernel_status",
            "data": payload
        }), flush=True)

    async def _handle_openclaw_message(self, data: Dict[str, Any]):
        """Handle incoming messages from OpenClaw Gateway"""
        print(f"📨 OpenClaw Message: {str(data)[:200]}", file=sys.stderr)
        
        try:
            # Extract message content
            msg_type = data.get("type")
            content = data.get("content", {})
            sender = data.get("sender")
            channel = data.get("channel")
            
            # === NEW: Emit OpenClaw Event to Frontend ===
            self._emit_event("openclaw_message", {
                "type": msg_type,
                "sender": sender,
                "channel": channel,
                "content": content,
                "timestamp": time.time()
            })
            
            if msg_type == "inbound_message":
                text = content.get("text", "")
                
                # Treat as a user query
                # Create a synthetic KernelMessage
                message = KernelMessage(
                    id=f"openclaw_{int(time.time())}",
                    message_type="query",
                    payload={
                        "query": text,
                        "context_mode": "chat",
                        "channel": channel,
                        "sender": sender
                    }
                )
                
                # Process response
                response = await self.process_message(message)
                
                # Send reply back via OpenClaw
                if response.success and response.data and "response" in response.data:
                    reply_text = response.data["response"]
                    if self.openclaw_client:
                        await self.openclaw_client.send_message(channel, sender, reply_text)
        except Exception as e:
            print(f"⚠️ OpenClaw handler error: {e}", file=sys.stderr)

    async def run(self):
        """Main run loop - reads from stdin, writes to stdout"""
        self.running = True
        self.loop = asyncio.get_running_loop()
        
        # Emit startup status
        self._emit_status("starting", "Kernel initializing...")
        print("🚀 Aether Kernel running...", file=sys.stderr)
        
        # Start Cron Service
        if self.cron:
            await self.cron.initialize()
            await self.cron.start()

        # Start OpenClaw Bridge (Gap 2)
        if self.openclaw_client:
            self.openclaw_client.set_callback(self._handle_openclaw_message)
            # Run in background task to not block loop
            asyncio.create_task(self.openclaw_client.connect())
            print("🔗 OpenClaw bridge connecting...", file=sys.stderr)
        
        # Initialize voice if enabled
        if self._voice_enabled and self.voice_pipeline:
            try:
                print("🎤 Initializing voice pipeline...", file=sys.stderr)
                self._emit_status("initializing_voice", "Starting voice subsystems...")
                await self.voice_pipeline.initialize()
                
                # Set callbacks
                self.voice_pipeline.set_transcription_callback(self._voice_transcription_callback)
                self.voice_pipeline.set_wake_word_callback(self._voice_wake_word_callback)
                
                # Start wake word detection
                if self.voice_pipeline._wake_word_detector:
                    await self.voice_pipeline._wake_word_detector.start_continuous_detection()
                    print("👂 Wake word detection active", file=sys.stderr)
                    self._emit_status("voice_ready", "Voice pipeline active")
            except Exception as e:
                print(f"❌ Voice initialization failed: {e}", file=sys.stderr)
                self._voice_enabled = False
                self._emit_status("voice_error", f"Voice init failed: {e}")
        
        # Start background system monitoring
        if self.monitor_agent.is_available:
            try:
                await self.monitor_agent.start_monitoring()
                print("📊 System monitoring active", file=sys.stderr)
            except Exception as e:
                print(f"⚠️ Monitor init failed: {e}", file=sys.stderr)
        
        # Emit final ready status
        self._emit_status("ready", "Kernel listening for commands", {
            "model": self.config.get("model"),
             "version": "0.4.0"
        })
        
        # Handle graceful shutdown
        def signal_handler(sig, frame):
            print("\n🛑 Shutting down Aether Kernel...", file=sys.stderr)
            self.running = False
            self._emit_status("stopping", "Kernel shutting down...")
            
            # Sync session memory to disk
            try:
                self.memory.sync_session_file()
                print("💾 Session memory synced", file=sys.stderr)
            except Exception as e:
                print(f"⚠️ Session sync failed: {e}", file=sys.stderr)
            
            # Shutdown voice
            if self.voice_pipeline:
                loop = asyncio.get_event_loop()
                loop.create_task(self.voice_pipeline.shutdown())
            
            # Shutdown monitor
            if self.monitor_agent.is_running:
                loop = asyncio.get_event_loop()
                loop.create_task(self.monitor_agent.stop_monitoring())
                
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        # Main message loop
        while self.running:
            try:
                # Read message from stdin (sent by Rust orchestrator)
                line = await asyncio.get_event_loop().run_in_executor(
                    None, sys.stdin.readline
                )
                
                if not line:
                    continue
                
                # DEBUG: Log raw input to debug communication
                print(f"🔍 DEBUG: Kernel received raw input: {line.strip()}", file=sys.stderr)
                
                # Parse the message
                try:
                    data = json.loads(line.strip())
                    message = KernelMessage(
                        id=data.get("id", "unknown"),
                        message_type=data.get("message_type", "unknown"),
                        payload=data.get("payload", {})
                    )
                except json.JSONDecodeError as e:
                    print(json.dumps({
                        "id": "error",
                        "success": False,
                        "error": f"Invalid JSON: {e}"
                    }), flush=True)
                    continue
                
                # Process and respond
                response = await self.process_message(message)
                
                # Write response to stdout (received by Rust orchestrator)
                print(json.dumps({
                    "id": response.id,
                    "success": response.success,
                    "message_type": response.message_type,
                    "data": response.data,
                    "error": response.error
                }), flush=True)
                
            except Exception as e:
                print(json.dumps({
                    "id": "error",
                    "success": False,
                    "error": str(e)
                }), flush=True)


async def main():
    """Entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Nexus Hybrid Kernel")
    parser.add_argument("--model", default="llama3.2:3b", help="LLM model to use")
    parser.add_argument("--ollama-url", default="http://localhost:11434", help="Ollama API URL")
    
    default_db = os.path.join(os.path.expanduser("~"), ".nexus", "lancedb")
    parser.add_argument("--db-path", default=default_db, help="LanceDB path")
    parser.add_argument("--enable-voice", action="store_true", default=False, help="Enable voice pipeline on startup")
    parser.add_argument("--daemon", action="store_true", help="Run in daemon mode (systemd integration)")
    
    args = parser.parse_args()
    
    config = {
        "model": args.model,
        "ollama_url": args.ollama_url,
        "lancedb_path": args.db_path,
        "voice_enabled": args.enable_voice
    }
    
    try:
        # === LOAD PERSISTED CONFIG FROM DISK ===
        rt_config = RuntimeConfig()
        await rt_config.load()
        persisted = rt_config.get_all()
        print(f"📋 Loaded {len(persisted)} persisted config keys", file=sys.stderr)
        
        # Merge: CLI args override persisted config
        # But persisted config fills in anything the CLI didn't set
        full_config = {**persisted, **config}
        
        kernel = AetherKernel(full_config)
        kernel.runtime_config = rt_config  # Share the loaded instance
        
        # Initialize self-learning engine
        print("🧠 Initializing Self-Learning Engine...", file=sys.stderr)
        await kernel.learning_engine.initialize()
        
        # Initialize Brain (Model Router) - This can fail if Ollama is down
        print("🧠 Initializing Brain & Model Router...", file=sys.stderr)
        try:
            await kernel.brain.initialize()
        except Exception as e:
            print(f"⚠️ Brain initialization warning (Ollama might be down): {e}", file=sys.stderr)
            # We continue even if brain fails, to allow diagnostics
        
        # Daemon mode: notify systemd when ready
        if args.daemon and DAEMON_AVAILABLE:
            sd_notify("READY=1")
            sd_notify(f"STATUS=Nexus Kernel running with model {args.model}")
            print("🔧 Running in daemon mode (systemd)", file=sys.stderr)
        
        await kernel.run()
        
    except Exception as e:
        print(f"❌ Critical Kernel Failure: {e}", file=sys.stderr)
        # Emit error formatted as JSON so frontend can see it before death
        print(json.dumps({
            "id": "fatal_error",
            "success": False,
            "message_type": "kernel_error",
            "data": {
                "error": str(e),
                "type": "startup_failure"
            }
        }), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
