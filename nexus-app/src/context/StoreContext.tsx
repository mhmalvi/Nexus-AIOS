
import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { AppState, ThoughtEvent, ActionRequest, Message, UISettings, Artifact, WindowState, Notification, Agent, VoiceSettings, Asset, Conversation } from '../types';
import { getCenterPosition, getCascadePosition, clampWindowPosition, clampWindowSize, getSafeWorkArea, HEADER_HEIGHT, DOCK_HEIGHT, STATUS_BAR_HEIGHT } from '../services/WindowBounds';
import { mockTauri } from '../services/mockTauri';

interface StoreContextType extends AppState {
  setTheme: (theme: AppState['ui']['theme']) => void;
  setAccentColor: (color: string) => void;
  setFocusMode: (enabled: boolean) => void;
  setLocked: (locked: boolean) => void;
  setDockAutoHide: (enabled: boolean) => void;
  setVoiceSettings: (settings: Partial<VoiceSettings>) => void;
  addToHistory: (command: string) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string) => void;
  deleteMessage: (id: string) => void;
  setThinking: (isThinking: boolean) => void;
  setSpeaking: (isSpeaking: boolean) => void;
  setError: (isError: boolean) => void;
  toggleReaction: (messageId: string, reaction: string) => void;
  startListening: () => void;
  stopListening: () => void;
  setTranscript: (text: string) => void;
  addThought: (thought: ThoughtEvent) => void;
  clearThoughts: () => void;
  setPendingAction: (action: ActionRequest | null) => void;
  setCommandPaletteOpen: (isOpen: boolean) => void;
  setGhostBarOpen: (isOpen: boolean) => void;
  spawnArtifact: (artifact: Artifact) => void;
  updateArtifact: (id: string, updates: Partial<Artifact>) => void;
  closeArtifact: (id: string) => void;
  openWindow: (id: string) => void;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  resizeWindow: (id: string, width: number, height: number) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  snapWindow: (id: string, snap: WindowState['snap']) => void;
  focusWindow: (id: string) => void;
  toggleAlwaysOnTop: (id: string) => void;
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'timestamp'>) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  updateAgentStatus: (id: string, updates: Partial<Agent>) => void;
  setSelectedAsset: (asset: Asset | null) => void;
  // Conversation management
  createConversation: () => string;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  clearConversation: () => void;
  thoughtStream: ThoughtEvent[];
  isCommandPaletteOpen: boolean;
  isGhostBarOpen: boolean;
}

const getInitialTheme = (): UISettings['theme'] => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('nexus_theme') as UISettings['theme'];
      if (saved) return saved;
    }
  } catch (e) {
    console.warn("Nexus Storage Warning: Could not access localStorage for theme.");
  }
  return 'dark';
};

const getInitialAccent = (): string => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('nexus_accent');
      if (saved) return saved;
    }
  } catch (e) {
    console.warn("Nexus Storage Warning: Could not access localStorage for accent.");
  }
  return '#007AFF';
};

// Constant default size for all windows
const DEFAULT_WIN_WIDTH = 800;
const DEFAULT_WIN_HEIGHT = 520;

const defaultWindows: Record<string, WindowState> = {
  // No position set → WindowFrame auto-centers each window in the canvas
  'echoes': { id: 'echoes', isOpen: true, isMinimized: false, isMaximized: false, zIndex: 10, size: { width: DEFAULT_WIN_WIDTH, height: DEFAULT_WIN_HEIGHT } },
  'war-room': { id: 'war-room', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 9, size: { width: DEFAULT_WIN_WIDTH, height: DEFAULT_WIN_HEIGHT } },
  'memory': { id: 'memory', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 8, size: { width: DEFAULT_WIN_WIDTH, height: DEFAULT_WIN_HEIGHT } },
  'security': { id: 'security', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 8, size: { width: DEFAULT_WIN_WIDTH, height: DEFAULT_WIN_HEIGHT } },
  'agents': { id: 'agents', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 7, size: { width: DEFAULT_WIN_WIDTH, height: DEFAULT_WIN_HEIGHT } },
  'files': { id: 'files', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 7, size: { width: DEFAULT_WIN_WIDTH, height: DEFAULT_WIN_HEIGHT } },
  'browser': { id: 'browser', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 6, size: { width: DEFAULT_WIN_WIDTH, height: DEFAULT_WIN_HEIGHT } },
  'code': { id: 'code', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 6, size: { width: DEFAULT_WIN_WIDTH, height: DEFAULT_WIN_HEIGHT } },
  'schedule': { id: 'schedule', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 6, size: { width: DEFAULT_WIN_WIDTH, height: DEFAULT_WIN_HEIGHT } },
  'modules': { id: 'modules', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 6, size: { width: DEFAULT_WIN_WIDTH, height: DEFAULT_WIN_HEIGHT } },
  'media': { id: 'media', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 6, size: { width: DEFAULT_WIN_WIDTH, height: DEFAULT_WIN_HEIGHT } },
  'settings': { id: 'settings', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 6, size: { width: DEFAULT_WIN_WIDTH, height: DEFAULT_WIN_HEIGHT } },
  'terminal': { id: 'terminal', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5, size: { width: DEFAULT_WIN_WIDTH, height: DEFAULT_WIN_HEIGHT } },
  'messaging': { id: 'messaging', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5, size: { width: DEFAULT_WIN_WIDTH, height: DEFAULT_WIN_HEIGHT } },
  'plugins': { id: 'plugins', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5, size: { width: DEFAULT_WIN_WIDTH, height: DEFAULT_WIN_HEIGHT } },
};

/**
 * Sanitize restored window positions/sizes to fit within the current viewport.
 * Prevents off-screen windows when the user changes screen size between sessions.
 */
function sanitizeWindowPositions(windows: Record<string, WindowState>): Record<string, WindowState> {
  if (typeof window === 'undefined') return windows;

  const screenW = window.innerWidth || 1920;
  const screenH = window.innerHeight || 1080;
  const workArea = getSafeWorkArea(screenW, screenH);
  const sanitized: Record<string, WindowState> = {};

  for (const [id, win] of Object.entries(windows)) {
    if (!win) { sanitized[id] = win; continue; }

    let w = win.size?.width || DEFAULT_WIN_WIDTH;
    let h = win.size?.height || DEFAULT_WIN_HEIGHT;

    // Clamp size to fit within work area
    const clampedSize = clampWindowSize(w, h, screenW, screenH);
    w = clampedSize.width;
    h = clampedSize.height;

    // Clamp position if it exists
    let position = win.position;
    if (position && typeof position.x === 'number' && typeof position.y === 'number') {
      // Strict containment: full window must stay within canvas bounds
      const clampedX = Math.max(0, Math.min(position.x, Math.max(0, workArea.width - w)));
      const clampedY = Math.max(0, Math.min(position.y, Math.max(0, workArea.height - h)));
      position = { x: clampedX, y: clampedY };
    }

    sanitized[id] = {
      ...win,
      size: { width: w, height: h },
      ...(position ? { position } : {}),
    };
  }

  return sanitized;
}

const getInitialWindows = (): Record<string, WindowState> => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('nexus_windows_v15');
      if (saved) {
        const parsed = JSON.parse(saved);
        const merged = { ...defaultWindows, ...parsed };
        return sanitizeWindowPositions(merged);
      }
    }
  } catch (e) {
    console.warn("Nexus Storage Warning: Could not load windows.");
  }
  return defaultWindows;
};

const initialState: AppState = {
  agent: {
    isThinking: false,
    isListening: false,
    isSpeaking: false,
    isError: false,
    transcript: '',
    currentThought: '',
    recentActions: []
  },
  swarm: [
    { id: 'manager', role: 'Manager', name: 'Orchestrator', status: 'idle', currentTask: 'Monitoring system bus', confidence: 100, avatar: 'Brain', model: 'llama3.1:8b' },
    { id: 'sec-ops', role: 'SecOps', name: 'Sentinel', status: 'idle', currentTask: 'Packet inspection (eBPF)', confidence: 98, avatar: 'Shield', model: 'phi3:mini' },
    { id: 'dev-arch', role: 'DevArch', name: 'Builder', status: 'idle', currentTask: 'Awaiting spec', confidence: 0, avatar: 'Code', model: 'qwen2.5-coder:7b' },
    { id: 'analyst', role: 'Analyst', name: 'Insight', status: 'idle', currentTask: 'Indexing context', confidence: 85, avatar: 'BarChart', model: 'mistral-nemo:12b' },
  ],
  ui: {
    theme: getInitialTheme(),
    accentColor: getInitialAccent(),
    fontSize: 14,
    sidebarWidth: 240,
    animations: true,
    showThoughts: true,
    focusMode: false,
    isLocked: true,
    dockAutoHide: (() => { try { const v = localStorage.getItem('nexus_dock_autohide'); return v !== null ? v === 'true' : true; } catch { return true; } })(),
    voiceSettings: {
      sensitivity: 1.0,
      responsiveness: 0.5,
      visualizerColor: 'primary'
    }
  },
  commandHistory: [],
  conversations: [{
    id: 'default',
    title: 'New Chat',
    messages: [
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Nexus AIOS Kernel v3.1 initialized. Swarm Cluster active.',
        timestamp: new Date(),
        tool: 'terminal'
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  }],
  activeConversationId: 'default',
  activeConversation: [
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Nexus AIOS Kernel v3.1 initialized. Swarm Cluster active.',
      timestamp: new Date(),
      tool: 'terminal'
    }
  ],
  pendingAction: null,
  artifacts: [],
  windows: getInitialWindows(),
  notifications: [],
  activeWindowId: 'echoes',
  selectedAsset: null,
};

type Action =
  | { type: 'SET_THEME'; payload: AppState['ui']['theme'] }
  | { type: 'SET_ACCENT_COLOR'; payload: string }
  | { type: 'SET_DOCK_AUTO_HIDE'; payload: boolean }
  | { type: 'SET_FOCUS_MODE'; payload: boolean }
  | { type: 'SET_LOCKED'; payload: boolean }
  | { type: 'SET_VOICE_SETTINGS'; payload: Partial<VoiceSettings> }
  | { type: 'ADD_HISTORY'; payload: string }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string, content: string } }
  | { type: 'SET_THINKING'; payload: boolean }
  | { type: 'SET_SPEAKING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: boolean }
  | { type: 'TOGGLE_REACTION'; payload: { messageId: string; reaction: string } }
  | { type: 'START_LISTENING' }
  | { type: 'STOP_LISTENING' }
  | { type: 'SET_TRANSCRIPT'; payload: string }
  | { type: 'ADD_THOUGHT'; payload: ThoughtEvent }
  | { type: 'CLEAR_THOUGHTS' }
  | { type: 'SET_PENDING_ACTION'; payload: ActionRequest | null }
  | { type: 'SET_COMMAND_PALETTE_OPEN'; payload: boolean }
  | { type: 'SET_GHOST_BAR_OPEN'; payload: boolean }
  | { type: 'SPAWN_ARTIFACT'; payload: Artifact }
  | { type: 'UPDATE_ARTIFACT'; payload: { id: string, updates: Partial<Artifact> } }
  | { type: 'CLOSE_ARTIFACT'; payload: string }
  | { type: 'WINDOW_ACTION'; payload: { id: string, action: 'open' | 'close' | 'minimize' | 'maximize' | 'focus' } }
  | { type: 'WINDOW_RESIZE'; payload: { id: string, width: number, height: number } }
  | { type: 'WINDOW_MOVE'; payload: { id: string, x: number, y: number } }
  | { type: 'WINDOW_SNAP'; payload: { id: string, snap: WindowState['snap'] } }
  | { type: 'WINDOW_TOGGLE_ALWAYS_ON_TOP'; payload: { id: string } }
  | { type: 'ADD_NOTIFICATION'; payload: Notification }
  | { type: 'MARK_NOTIFICATION_READ'; payload: string }
  | { type: 'CLEAR_NOTIFICATIONS' }
  | { type: 'UPDATE_AGENT'; payload: { id: string, updates: Partial<Agent> } }
  | { type: 'SET_SELECTED_ASSET'; payload: Asset | null }
  | { type: 'DELETE_MESSAGE'; payload: string }
  | { type: 'CREATE_CONVERSATION'; payload: Conversation }
  | { type: 'SWITCH_CONVERSATION'; payload: string }
  | { type: 'DELETE_CONVERSATION'; payload: string }
  | { type: 'RENAME_CONVERSATION'; payload: { id: string, title: string } }
  | { type: 'CLEAR_CONVERSATION' };

const StoreContext = createContext<StoreContextType | undefined>(undefined);

function storeReducer(state: AppState & { thoughtStream: ThoughtEvent[], isCommandPaletteOpen: boolean, isGhostBarOpen: boolean }, action: Action) {
  switch (action.type) {
    case 'SET_THEME':
      return { ...state, ui: { ...state.ui, theme: action.payload } };
    case 'SET_ACCENT_COLOR':
      return { ...state, ui: { ...state.ui, accentColor: action.payload } };
    case 'SET_DOCK_AUTO_HIDE':
      try { localStorage.setItem('nexus_dock_autohide', String(action.payload)); } catch { }
      return { ...state, ui: { ...state.ui, dockAutoHide: action.payload } };
    case 'SET_FOCUS_MODE':
      return { ...state, ui: { ...state.ui, focusMode: action.payload } };
    case 'SET_LOCKED':
      return { ...state, ui: { ...state.ui, isLocked: action.payload } };
    case 'SET_VOICE_SETTINGS':
      return { ...state, ui: { ...state.ui, voiceSettings: { ...state.ui.voiceSettings, ...action.payload } } };
    case 'ADD_HISTORY':
      if (state.commandHistory[0] === action.payload) return state;
      return { ...state, commandHistory: [action.payload, ...state.commandHistory].slice(0, 99) };
    case 'ADD_MESSAGE':
      return {
        ...state,
        activeConversation: [...state.activeConversation, action.payload],
        conversations: state.conversations.map(c =>
          c.id === state.activeConversationId
            ? { ...c, messages: [...c.messages, action.payload], updatedAt: new Date() }
            : c
        )
      };
    case 'UPDATE_MESSAGE':
      return {
        ...state,
        activeConversation: state.activeConversation.map(msg =>
          msg.id === action.payload.id ? { ...msg, content: action.payload.content } : msg
        ),
        conversations: state.conversations.map(c =>
          c.id === state.activeConversationId
            ? {
              ...c,
              messages: c.messages.map(msg =>
                msg.id === action.payload.id ? { ...msg, content: action.payload.content } : msg
              ),
              updatedAt: new Date()
            }
            : c
        )
      };
    case 'SET_THINKING':
      return { ...state, agent: { ...state.agent, isThinking: action.payload } };
    case 'SET_SPEAKING':
      return { ...state, agent: { ...state.agent, isSpeaking: action.payload } };
    case 'SET_ERROR':
      return { ...state, agent: { ...state.agent, isError: action.payload } };
    case 'TOGGLE_REACTION':
      return {
        ...state,
        conversations: state.conversations.map(c =>
          c.id === state.activeConversationId
            ? {
              ...c,
              messages: c.messages.map(m =>
                m.id === action.payload.messageId
                  ? {
                    ...m,
                    reactions: m.reactions?.includes(action.payload.reaction)
                      ? m.reactions.filter(r => r !== action.payload.reaction)
                      : [...(m.reactions || []), action.payload.reaction]
                  }
                  : m
              )
            }
            : c
        )
      };
    case 'START_LISTENING':
      return { ...state, agent: { ...state.agent, isListening: true, isError: false, transcript: '' } };
    case 'STOP_LISTENING':
      return { ...state, agent: { ...state.agent, isListening: false } };
    case 'SET_TRANSCRIPT':
      return { ...state, agent: { ...state.agent, transcript: action.payload } };
    case 'ADD_THOUGHT':
      return {
        ...state,
        agent: { ...state.agent, currentThought: action.payload.content },
        thoughtStream: [action.payload, ...state.thoughtStream].slice(0, 50)
      };
    case 'CLEAR_THOUGHTS':
      return {
        ...state,
        agent: { ...state.agent, currentThought: '' },
        thoughtStream: []
      };
    case 'SET_PENDING_ACTION':
      return { ...state, pendingAction: action.payload };
    case 'SET_COMMAND_PALETTE_OPEN':
      return { ...state, isCommandPaletteOpen: action.payload };
    case 'SET_GHOST_BAR_OPEN':
      return { ...state, isGhostBarOpen: action.payload };
    case 'SPAWN_ARTIFACT':
      if (state.artifacts.some(a => a.id === action.payload.id)) return state;
      return { ...state, artifacts: [...state.artifacts, action.payload] };
    case 'UPDATE_ARTIFACT':
      return {
        ...state,
        artifacts: state.artifacts.map(art =>
          art.id === action.payload.id ? { ...art, ...action.payload.updates } : art
        )
      };
    case 'CLOSE_ARTIFACT':
      return { ...state, artifacts: state.artifacts.filter(a => a.id !== action.payload) };
    case 'WINDOW_ACTION': {
      const { id, action: winAction } = action.payload;
      let windows = { ...state.windows };
      // Determine the highest Z currently in use, ensuring we start distinct from global UI (Dock is z-90)
      let maxZ = Math.max(100, ...Object.values(windows || {}).map(w => w?.zIndex || 0));
      let activeWindowId = state.activeWindowId;

      // Normalize z-indices when they grow too high (preserve relative order)
      if (maxZ > 2000) {
        const sorted = Object.entries(windows)
          .filter(([, w]) => w)
          .sort(([, a], [, b]) => (a.zIndex || 0) - (b.zIndex || 0));
        sorted.forEach(([wid], i) => {
          windows[wid] = { ...windows[wid], zIndex: i + 1 };
        });
        maxZ = sorted.length;
      }

      if (!windows[id]) return state;

      switch (winAction) {
        case 'open': {
          const screenW = typeof window !== 'undefined' ? window.innerWidth : 1920;
          const screenH = typeof window !== 'undefined' ? window.innerHeight : 1080;
          const dockAutoHide = state.ui.dockAutoHide;
          const workArea = getSafeWorkArea(screenW, screenH, dockAutoHide);

          // Responsive window sizing: adapt to viewport, never exceed 80% of canvas
          const savedW = windows[id].size?.width || DEFAULT_WIN_WIDTH;
          const savedH = windows[id].size?.height || DEFAULT_WIN_HEIGHT;
          const winWidth = Math.min(savedW, Math.floor(workArea.width * 0.8));
          const winHeight = Math.min(savedH, Math.floor(workArea.height * 0.85));

          // Centered Cascade: Start at center, then offset for each new window
          const openCount = Object.values(windows || {}).filter(w => w?.isOpen && !w?.isMinimized).length;
          const pos = getCascadePosition(openCount, winWidth, winHeight, screenW, screenH, dockAutoHide);

          windows[id] = {
            ...windows[id],
            isOpen: true,
            isMinimized: false,
            isMaximized: false,
            snap: undefined,
            zIndex: maxZ + 1,
            position: pos,
            size: { width: winWidth, height: winHeight },
          };
          activeWindowId = id;
          break;
        }
        case 'close':
          windows[id] = { ...windows[id], isOpen: false };
          if (activeWindowId === id) activeWindowId = null;
          break;
        case 'minimize':
          windows[id] = { ...windows[id], isMinimized: true };
          if (activeWindowId === id) activeWindowId = null;
          break;
        case 'maximize':
          windows[id] = { ...windows[id], isMaximized: !windows[id].isMaximized, zIndex: maxZ + 1 };
          activeWindowId = id;
          break;
        case 'focus':
          // Bring to front if not already
          if (windows[id].zIndex !== maxZ || windows[id].isMinimized) {
            windows[id] = { ...windows[id], isMinimized: false, zIndex: maxZ + 1 };
          }
          activeWindowId = id;
          break;
      }
      return { ...state, windows, activeWindowId };
    }
    case 'WINDOW_RESIZE': {
      const { id, width, height } = action.payload;
      const windows = { ...state.windows };
      if (!windows[id]) return state;
      windows[id] = { ...windows[id], size: { width, height } };
      return { ...state, windows };
    }
    case 'WINDOW_MOVE': {
      const { id, x, y } = action.payload;
      const windows = { ...state.windows };
      if (!windows[id]) return state;
      windows[id] = { ...windows[id], position: { x, y } };
      return { ...state, windows };
    }
    case 'WINDOW_SNAP': {
      const { id, snap } = action.payload;
      const windows = { ...state.windows };
      if (!windows[id]) return state;

      windows[id] = {
        ...windows[id],
        snap,
        isMaximized: snap === 'top', // 'top' snap acts as maximize
      };
      return { ...state, windows };
    }
    case 'WINDOW_TOGGLE_ALWAYS_ON_TOP': {
      const { id } = action.payload;
      const windows = { ...state.windows };
      if (!windows[id]) return state;

      const newState = !windows[id].isAlwaysOnTop;
      windows[id] = { ...windows[id], isAlwaysOnTop: newState };

      if (newState) {
        const maxZ = Math.max(0, ...Object.values(windows || {}).map(w => w?.zIndex || 0));
        windows[id].zIndex = maxZ + 1;
      }

      return { ...state, windows };
    }
    case 'ADD_NOTIFICATION':
      return { ...state, notifications: [action.payload, ...state.notifications] };
    case 'MARK_NOTIFICATION_READ':
      return { ...state, notifications: state.notifications.map(n => n.id === action.payload ? { ...n, read: true } : n) };
    case 'CLEAR_NOTIFICATIONS':
      return { ...state, notifications: [] };
    case 'UPDATE_AGENT':
      return {
        ...state,
        swarm: state.swarm.map(agent =>
          agent.id === action.payload.id ? { ...agent, ...action.payload.updates } : agent
        )
      };
    case 'SET_SELECTED_ASSET':
      return { ...state, selectedAsset: action.payload };
    case 'DELETE_MESSAGE':
      return {
        ...state,
        activeConversation: state.activeConversation.filter(msg => msg.id !== action.payload),
        conversations: state.conversations.map(c =>
          c.id === state.activeConversationId
            ? { ...c, messages: c.messages.filter(msg => msg.id !== action.payload), updatedAt: new Date() }
            : c
        )
      };
    case 'CREATE_CONVERSATION':
      return {
        ...state,
        conversations: [action.payload, ...state.conversations],
        activeConversationId: action.payload.id,
        activeConversation: action.payload.messages
      };
    case 'SWITCH_CONVERSATION': {
      const conv = state.conversations.find(c => c.id === action.payload);
      if (!conv) return state;
      return {
        ...state,
        activeConversationId: action.payload,
        activeConversation: conv.messages
      };
    }
    case 'DELETE_CONVERSATION': {
      const remaining = state.conversations.filter(c => c.id !== action.payload);
      if (remaining.length === 0) {
        // Don't delete last conversation, reset it instead
        const resetConv: Conversation = {
          id: 'default',
          title: 'New Chat',
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date()
        };
        return { ...state, conversations: [resetConv], activeConversationId: 'default', activeConversation: [] };
      }
      const newActiveId = state.activeConversationId === action.payload ? remaining[0].id : state.activeConversationId;
      const newActive = remaining.find(c => c.id === newActiveId);
      return {
        ...state,
        conversations: remaining,
        activeConversationId: newActiveId,
        activeConversation: newActive?.messages || []
      };
    }
    case 'RENAME_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.map(c =>
          c.id === action.payload.id ? { ...c, title: action.payload.title, updatedAt: new Date() } : c
        )
      };
    case 'CLEAR_CONVERSATION':
      return {
        ...state,
        activeConversation: [],
        conversations: state.conversations.map(c =>
          c.id === state.activeConversationId ? { ...c, messages: [], updatedAt: new Date() } : c
        )
      };
    default:
      return state;
  }
}

export function StoreProvider({ children }: { children?: ReactNode }) {
  const [state, dispatch] = useReducer(storeReducer, { ...initialState, thoughtStream: [], isCommandPaletteOpen: false, isGhostBarOpen: false });

  useEffect(() => {
    try {
      // Dynamic import to avoid SSR issues if any, though SPA usually fine
      import('../services/tauriApi').then(({ default: tauriApi }) => {
        if (state.agent.isListening) {
          tauriApi.kernel.send(JSON.stringify({ action: "listen" }), 'voice');
        } else {
          // Optional: send stop command if supported
          // tauriApi.kernel.send(JSON.stringify({ action: "stop_listen" }), 'voice');
        }
      });
    } catch (e) {
      console.error("Failed to sync voice state:", e);
    }
  }, [state.agent.isListening]);

  useEffect(() => {
    const unsub = mockTauri.subscribeOpenClaw((msg) => {
      dispatch({
        type: 'ADD_NOTIFICATION',
        payload: {
          id: `oc-${Date.now()}`,
          timestamp: new Date(),
          read: false,
          title: `Message from ${msg.sender}`,
          message: typeof msg.content === 'string' ? msg.content : (msg.content.text || 'New message'),
          type: 'info',
        }
      });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage) {
        localStorage.setItem('nexus_windows_v15', JSON.stringify(state.windows));
      }
    } catch (e) { console.error("Failed to save windows:", e); }
  }, [state.windows]);

  useEffect(() => {
    try {
      const root = window.document.documentElement;
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      const applyTheme = () => {
        const theme = state.ui.theme;
        root.classList.remove('light', 'dark');

        if (theme === 'system') {
          const systemTheme = mediaQuery.matches ? 'dark' : 'light';
          root.classList.add(systemTheme);
        } else {
          root.classList.add(theme);
        }
      };

      applyTheme();
      root.style.setProperty('--primary', state.ui.accentColor);
      root.style.setProperty('--ring', state.ui.accentColor);
      root.style.setProperty('--nexus-brain', state.ui.accentColor);

      const handleSystemChange = () => { if (state.ui.theme === 'system') applyTheme(); };
      mediaQuery.addEventListener('change', handleSystemChange);

      try {
        if (window.localStorage) {
          localStorage.setItem('nexus_theme', state.ui.theme);
          localStorage.setItem('nexus_accent', state.ui.accentColor);
        }
      } catch (e) { }

      return () => mediaQuery.removeEventListener('change', handleSystemChange);
    } catch (e) {
      console.error("Theme effect failed", e);
    }
  }, [state.ui.theme, state.ui.accentColor]);

  const value = {
    ...state,
    setTheme: (theme: AppState['ui']['theme']) => dispatch({ type: 'SET_THEME', payload: theme }),
    setAccentColor: (color: string) => dispatch({ type: 'SET_ACCENT_COLOR', payload: color }),
    setFocusMode: (enabled: boolean) => dispatch({ type: 'SET_FOCUS_MODE', payload: enabled }),
    setDockAutoHide: (enabled: boolean) => dispatch({ type: 'SET_DOCK_AUTO_HIDE', payload: enabled }),
    setLocked: (locked: boolean) => dispatch({ type: 'SET_LOCKED', payload: locked }),
    setVoiceSettings: (settings: Partial<VoiceSettings>) => dispatch({ type: 'SET_VOICE_SETTINGS', payload: settings }),
    addToHistory: (command: string) => dispatch({ type: 'ADD_HISTORY', payload: command }),
    addMessage: (message: Message) => dispatch({ type: 'ADD_MESSAGE', payload: message }),
    updateMessage: (id: string, content: string) => dispatch({ type: 'UPDATE_MESSAGE', payload: { id, content } }),

    setThinking: (isThinking: boolean) => dispatch({ type: 'SET_THINKING', payload: isThinking }),
    setSpeaking: (isSpeaking: boolean) => dispatch({ type: 'SET_SPEAKING', payload: isSpeaking }),
    setError: (isError: boolean) => dispatch({ type: 'SET_ERROR', payload: isError }),
    toggleReaction: (messageId: string, reaction: string) => dispatch({ type: 'TOGGLE_REACTION', payload: { messageId, reaction } }),
    startListening: () => {
      dispatch({ type: 'START_LISTENING' });

      // Frontend-first Hybrid Voice Strategy
      if ('webkitSpeechRecognition' in window) {
        // @ts-ignore - TypeScript doesn't know about webkitSpeechRecognition by default
        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          dispatch({
            type: 'ADD_THOUGHT', payload: {
              id: `voice-init-${Date.now()}`,
              timestamp: new Date(),
              type: 'action',
              component: 'supervisor',
              content: 'Voice: Local sensor active.'
            }
          });
        };

        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          if (interimTranscript) dispatch({ type: 'SET_TRANSCRIPT', payload: interimTranscript });
          if (finalTranscript) {
            dispatch({ type: 'SET_TRANSCRIPT', payload: finalTranscript });
            dispatch({
              type: 'ADD_MESSAGE',
              payload: {
                id: Date.now().toString(),
                role: 'user',
                content: finalTranscript,
                timestamp: new Date()
              }
            });
            // Send to backend as text query
            dispatch({ type: 'STOP_LISTENING' });
          }
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          dispatch({ type: 'STOP_LISTENING' });
          dispatch({
            type: 'ADD_NOTIFICATION',
            payload: {
              id: Date.now().toString(),
              type: 'error',
              title: 'Voice Input Failed',
              message: `Error: ${event.error || 'Unknown error'}. Check microphone permissions.`,
              read: false,
              timestamp: new Date()
            }
          });
        };

        recognition.onend = () => {
          dispatch({ type: 'STOP_LISTENING' });
        };

        recognition.start();
      } else {
        // Fallback to backend if browser API missing (rare)
        import('../services/tauriApi').then(({ default: tauriApi }) => {
          tauriApi.kernel.send(JSON.stringify({ action: "listen" }), 'voice');
        });
      }
    },
    stopListening: () => {
      dispatch({ type: 'STOP_LISTENING' });
      // Stop logic is largely handled by the recognition object's auto-stop or onend, 
      // but we ensure state is cleared.
    },
    setTranscript: (text: string) => dispatch({ type: 'SET_TRANSCRIPT', payload: text }),
    addThought: (thought: ThoughtEvent) => dispatch({ type: 'ADD_THOUGHT', payload: { ...thought, timestamp: new Date(thought.timestamp) } }),
    clearThoughts: () => dispatch({ type: 'CLEAR_THOUGHTS' }),
    setPendingAction: (action: ActionRequest | null) => dispatch({ type: 'SET_PENDING_ACTION', payload: action }),
    setCommandPaletteOpen: (isOpen: boolean) => dispatch({ type: 'SET_COMMAND_PALETTE_OPEN', payload: isOpen }),
    setGhostBarOpen: (isOpen: boolean) => dispatch({ type: 'SET_GHOST_BAR_OPEN', payload: isOpen }),
    spawnArtifact: (artifact: Artifact) => dispatch({ type: 'SPAWN_ARTIFACT', payload: artifact }),
    updateArtifact: (id: string, updates: Partial<Artifact>) => dispatch({ type: 'UPDATE_ARTIFACT', payload: { id, updates } }),
    closeArtifact: (id: string) => dispatch({ type: 'CLOSE_ARTIFACT', payload: id }),
    openWindow: (id: string) => dispatch({ type: 'WINDOW_ACTION', payload: { id, action: 'open' } }),
    closeWindow: (id: string) => dispatch({ type: 'WINDOW_ACTION', payload: { id, action: 'close' } }),
    minimizeWindow: (id: string) => dispatch({ type: 'WINDOW_ACTION', payload: { id, action: 'minimize' } }),
    maximizeWindow: (id: string) => dispatch({ type: 'WINDOW_ACTION', payload: { id, action: 'maximize' } }),
    resizeWindow: (id: string, width: number, height: number) => dispatch({ type: 'WINDOW_RESIZE', payload: { id, width, height } }),
    moveWindow: (id: string, x: number, y: number) => dispatch({ type: 'WINDOW_MOVE', payload: { id, x, y } }),
    snapWindow: (id: string, snap: WindowState['snap']) => dispatch({ type: 'WINDOW_SNAP', payload: { id, snap } }),
    focusWindow: (id: string) => dispatch({ type: 'WINDOW_ACTION', payload: { id, action: 'focus' } }),
    toggleAlwaysOnTop: (id: string) => dispatch({ type: 'WINDOW_TOGGLE_ALWAYS_ON_TOP', payload: { id } }),
    addNotification: (n: Omit<Notification, 'id' | 'read' | 'timestamp'>) => dispatch({
      type: 'ADD_NOTIFICATION',
      payload: { ...n, id: Date.now().toString(), read: false, timestamp: new Date() }
    }),
    markNotificationRead: (id: string) => dispatch({ type: 'MARK_NOTIFICATION_READ', payload: id }),
    clearNotifications: () => dispatch({ type: 'CLEAR_NOTIFICATIONS' }),
    updateAgentStatus: (id: string, updates: Partial<Agent>) => dispatch({ type: 'UPDATE_AGENT', payload: { id, updates } }),
    setSelectedAsset: (asset: Asset | null) => dispatch({ type: 'SET_SELECTED_ASSET', payload: asset }),
    deleteMessage: (id: string) => dispatch({ type: 'DELETE_MESSAGE', payload: id }),
    createConversation: () => {
      const newId = `conv-${Date.now()}`;
      const newConv: Conversation = {
        id: newId,
        title: 'New Chat',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      dispatch({ type: 'CREATE_CONVERSATION', payload: newConv });
      return newId;
    },
    switchConversation: (id: string) => dispatch({ type: 'SWITCH_CONVERSATION', payload: id }),
    deleteConversation: (id: string) => dispatch({ type: 'DELETE_CONVERSATION', payload: id }),
    renameConversation: (id: string, title: string) => dispatch({ type: 'RENAME_CONVERSATION', payload: { id, title } }),
    clearConversation: () => dispatch({ type: 'CLEAR_CONVERSATION' }),
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
}
