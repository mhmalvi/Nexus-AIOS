
export interface ThoughtEvent {
  id: string;
  timestamp: Date;
  type: 'thought' | 'action' | 'observation' | 'error';
  component: 'scheduler' | 'worker' | 'supervisor' | 'memory';
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

export interface UISettings {
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  sidebarWidth: number;
  animations: boolean;
  showThoughts: boolean;
}

export interface AppState {
  agent: AgentState;
  ui: UISettings;
  commandHistory: string[];
  activeConversation: Message[];
  pendingAction: ActionRequest | null;
  artifacts: Artifact[];
}
