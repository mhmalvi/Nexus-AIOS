
export interface ThoughtEvent {
  id: string;
  timestamp: Date;
  type: 'thought' | 'action' | 'observation' | 'error';
  component: 'scheduler' | 'worker' | 'supervisor' | 'memory' | 'sec-ops' | 'dev-arch' | 'data-analyst';
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
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tool?: 'terminal' | 'browser' | 'search' | 'code';
  reactions?: string[];
  relatedArtifactId?: string;
}

export interface Agent {
  id: string;
  role: 'Manager' | 'SecOps' | 'DevArch' | 'Analyst';
  name: string;
  status: 'idle' | 'thinking' | 'executing' | 'reviewing';
  currentTask: string;
  confidence: number;
  avatar: string; // icon name
}

export interface AgentState {
  isThinking: boolean;
  isListening: boolean;
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
  voiceSettings: VoiceSettings;
}

export interface WindowState {
  id: string;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  isAlwaysOnTop?: boolean;
  snap?: 'left' | 'right' | 'top' | null;
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
    type: 'image' | 'video' | 'audio' | 'unknown';
    metadata?: Record<string, any>;
}

export interface AppState {
  agent: AgentState;
  swarm: Agent[];
  ui: UISettings;
  commandHistory: string[];
  activeConversation: Message[];
  pendingAction: ActionRequest | null;
  artifacts: Artifact[];
  windows: Record<string, WindowState>;
  notifications: Notification[];
  activeWindowId: string | null;
  selectedAsset: Asset | null;
}
