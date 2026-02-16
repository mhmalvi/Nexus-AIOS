
export interface ThoughtEvent {
  id: string;
  timestamp: Date;
  type: 'thought' | 'action' | 'observation' | 'error' | 'success';
  component: 'scheduler' | 'worker' | 'supervisor' | 'memory' | 'sec-ops' | 'dev-arch' | 'data-analyst' | 'modules' | 'swarm';
  content: string;
  metadata?: Record<string, any>;
}

export interface ActionRequest {
  id: string;
  type: string;
  command: string;
  reasoning: string;
  tool: string;
  parameters: Record<string, any>;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface Artifact {
  id: string;
  title: string;
  type: 'code' | 'preview' | 'analysis' | 'image';
  content: string;
  isVisible: boolean;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'openclaw';
  content: string;
  timestamp: Date;
  tool?: 'terminal' | 'browser' | 'search' | 'code';
  reactions?: string[];
  relatedArtifactId?: string;
  metadata?: { sender?: string; channel?: string };
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Agent {
  id: string;
  role: 'Manager' | 'SecOps' | 'DevArch' | 'Analyst';
  name: string;
  status: 'idle' | 'thinking' | 'executing' | 'reviewing';
  currentTask: string;
  confidence: number;
  avatar: string; // icon name
  model?: string; // e.g. "llama3.2:3b", "qwen2.5:7b"
}

export interface AgentState {
  isThinking: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isError: boolean;
  transcript: string;
  currentThought: string;
  recentActions: Array<{
    id: string;
    command: string;
    timestamp: Date;
    approved: boolean;
  }>;
}

export interface VoiceSettings {
  sensitivity: number; // 0.1 to 2.0
  responsiveness: number; // 0.1 to 1.0 (smoothing)
  visualizerColor: 'primary' | 'rainbow' | 'monochrome';
}

export interface UISettings {
  theme: 'light' | 'dark' | 'system';
  accentColor: string;
  fontSize: number;
  sidebarWidth: number;
  animations: boolean;
  showThoughts: boolean;
  focusMode: boolean;
  isLocked: boolean;
  dockAutoHide: boolean;
  voiceSettings: VoiceSettings;
}

export interface WindowState {
  id: string;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  isAlwaysOnTop?: boolean;
  snap?: 'left' | 'right' | 'top' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | null;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  zIndex: number;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'insight';
  timestamp: Date;
  read: boolean;
}

export interface Toast {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'insight';
  timestamp: Date;
}

export interface SearchResult {
  id: string;
  type: 'window' | 'message' | 'artifact' | 'action';
  title: string;
  subtitle?: string;
  action: () => void;
}

export interface Asset {
  id: string;
  name: string;
  url: string;
  path?: string;
  type: 'image' | 'video' | 'audio' | 'code' | 'unknown';
  metadata?: Record<string, any>;
}

export interface AppState {
  agent: AgentState;
  swarm: Agent[];
  ui: UISettings;
  commandHistory: string[];
  conversations: Conversation[];
  activeConversationId: string | null;
  activeConversation: Message[]; // Derived from active conversation for backward compat
  pendingAction: ActionRequest | null;
  artifacts: Artifact[];
  windows: Record<string, WindowState>;
  notifications: Notification[];
  toasts: Toast[];
  activeWindowId: string | null;
  selectedAsset: Asset | null;
}
