
import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { AppState, ThoughtEvent, ActionRequest, Message, UISettings, Artifact, WindowState, Notification } from '../types';

interface StoreContextType extends AppState {
  setTheme: (theme: AppState['ui']['theme']) => void;
  setAccentColor: (color: string) => void;
  addToHistory: (command: string) => void;
  addMessage: (message: Message) => void;
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
  
  // Window Management
  openWindow: (id: string) => void;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  
  // Notifications
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'timestamp'>) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;

  thoughtStream: ThoughtEvent[];
  isCommandPaletteOpen: boolean;
  isGhostBarOpen: boolean;
}

const getInitialTheme = (): UISettings['theme'] => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('nexus_theme') as UISettings['theme'];
    if (saved) return saved;
  }
  return 'dark'; 
};

const getInitialAccent = (): string => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('nexus_accent');
    if (saved) return saved;
  }
  return '#007AFF'; 
};

const initialState: AppState = {
  agent: {
    isThinking: false,
    isListening: false,
    transcript: '',
    currentThought: '',
    recentActions: []
  },
  ui: {
    theme: getInitialTheme(),
    accentColor: getInitialAccent(),
    fontSize: 14,
    sidebarWidth: 240,
    animations: true,
    showThoughts: true
  },
  commandHistory: [],
  activeConversation: [
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Nexus AIOS Kernel v3.0 initialized. Aether Glass Environment ready.',
      timestamp: new Date(),
      tool: 'terminal'
    }
  ],
  pendingAction: null,
  artifacts: [],
  windows: {
    'chat': { id: 'chat', isOpen: true, isMinimized: false, isMaximized: false, zIndex: 10 },
    'war-room': { id: 'war-room', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 9 },
    'memory': { id: 'memory', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 8 },
    'agents': { id: 'agents', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 7 },
    'settings': { id: 'settings', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 6 },
  },
  notifications: [],
  activeWindowId: 'chat'
};

type Action =
  | { type: 'SET_THEME'; payload: AppState['ui']['theme'] }
  | { type: 'SET_ACCENT_COLOR'; payload: string }
  | { type: 'ADD_HISTORY'; payload: string }
  | { type: 'ADD_MESSAGE'; payload: Message }
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
  | { type: 'ADD_NOTIFICATION'; payload: Notification }
  | { type: 'MARK_NOTIFICATION_READ'; payload: string }
  | { type: 'CLEAR_NOTIFICATIONS' };

const StoreContext = createContext<StoreContextType | undefined>(undefined);

function storeReducer(state: AppState & { thoughtStream: ThoughtEvent[], isCommandPaletteOpen: boolean, isGhostBarOpen: boolean }, action: Action) {
  switch (action.type) {
    case 'SET_THEME':
      return { ...state, ui: { ...state.ui, theme: action.payload } };
    case 'SET_ACCENT_COLOR':
      return { ...state, ui: { ...state.ui, accentColor: action.payload } };
    case 'ADD_HISTORY':
      if (state.commandHistory[0] === action.payload) return state;
      return { ...state, commandHistory: [action.payload, ...state.commandHistory].slice(0, 99) };
    case 'ADD_MESSAGE':
      return { ...state, activeConversation: [...state.activeConversation, action.payload] };
    case 'TOGGLE_REACTION':
      return state;
    case 'START_LISTENING':
      return { ...state, agent: { ...state.agent, isListening: true, transcript: '' } };
    case 'STOP_LISTENING':
      return { ...state, agent: { ...state.agent, isListening: false } };
    case 'SET_TRANSCRIPT':
      return { ...state, agent: { ...state.agent, transcript: action.payload } };
    case 'ADD_THOUGHT':
      return { 
        ...state, 
        agent: { ...state.agent, isThinking: true, currentThought: action.payload.content },
        thoughtStream: [action.payload, ...state.thoughtStream].slice(0, 50)
      };
    case 'CLEAR_THOUGHTS':
      return { 
        ...state, 
        agent: { ...state.agent, isThinking: false, currentThought: '' },
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
        const windows = { ...state.windows };
        const maxZ = Math.max(...Object.values(windows).map(w => w.zIndex));
        let activeWindowId = state.activeWindowId;
        
        if (!windows[id]) return state; 

        switch(winAction) {
            case 'open':
                windows[id] = { ...windows[id], isOpen: true, isMinimized: false, zIndex: maxZ + 1 };
                activeWindowId = id;
                break;
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
                windows[id] = { ...windows[id], isMinimized: false, zIndex: maxZ + 1 };
                activeWindowId = id;
                break;
        }
        return { ...state, windows, activeWindowId };
    }
    case 'ADD_NOTIFICATION':
        return { ...state, notifications: [action.payload, ...state.notifications] };
    case 'MARK_NOTIFICATION_READ':
        return { ...state, notifications: state.notifications.map(n => n.id === action.payload ? { ...n, read: true } : n) };
    case 'CLEAR_NOTIFICATIONS':
        return { ...state, notifications: [] };
    default:
      return state;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(storeReducer, { ...initialState, thoughtStream: [], isCommandPaletteOpen: false, isGhostBarOpen: false });

  // Theme Handling
  useEffect(() => {
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
    // Dynamic Accent Color
    root.style.setProperty('--primary', state.ui.accentColor);
    root.style.setProperty('--ring', state.ui.accentColor);
    root.style.setProperty('--nexus-brain', state.ui.accentColor);

    const handleSystemChange = () => { if (state.ui.theme === 'system') applyTheme(); };
    mediaQuery.addEventListener('change', handleSystemChange);
    return () => mediaQuery.removeEventListener('change', handleSystemChange);
  }, [state.ui.theme, state.ui.accentColor]);

  const value = {
    ...state,
    setTheme: (theme: AppState['ui']['theme']) => dispatch({ type: 'SET_THEME', payload: theme }),
    setAccentColor: (color: string) => dispatch({ type: 'SET_ACCENT_COLOR', payload: color }),
    addToHistory: (command: string) => dispatch({ type: 'ADD_HISTORY', payload: command }),
    addMessage: (message: Message) => dispatch({ type: 'ADD_MESSAGE', payload: message }),
    toggleReaction: (messageId: string, reaction: string) => dispatch({ type: 'TOGGLE_REACTION', payload: { messageId, reaction } }),
    startListening: () => dispatch({ type: 'START_LISTENING' }),
    stopListening: () => dispatch({ type: 'STOP_LISTENING' }),
    setTranscript: (text: string) => dispatch({ type: 'SET_TRANSCRIPT', payload: text }),
    addThought: (thought: ThoughtEvent) => dispatch({ type: 'ADD_THOUGHT', payload: thought }),
    clearThoughts: () => dispatch({ type: 'CLEAR_THOUGHTS' }),
    setPendingAction: (action: ActionRequest | null) => dispatch({ type: 'SET_PENDING_ACTION', payload: action }),
    setCommandPaletteOpen: (isOpen: boolean) => dispatch({ type: 'SET_COMMAND_PALETTE_OPEN', payload: isOpen }),
    setGhostBarOpen: (isOpen: boolean) => dispatch({ type: 'SET_GHOST_BAR_OPEN', payload: isOpen }),
    spawnArtifact: (artifact: Artifact) => dispatch({ type: 'SPAWN_ARTIFACT', payload: artifact }),
    updateArtifact: (id: string, updates: Partial<Artifact>) => dispatch({ type: 'UPDATE_ARTIFACT', payload: { id, updates } }),
    closeArtifact: (id: string) => dispatch({ type: 'CLOSE_ARTIFACT', payload: id }),
    
    // Window Actions
    openWindow: (id: string) => dispatch({ type: 'WINDOW_ACTION', payload: { id, action: 'open' } }),
    closeWindow: (id: string) => dispatch({ type: 'WINDOW_ACTION', payload: { id, action: 'close' } }),
    minimizeWindow: (id: string) => dispatch({ type: 'WINDOW_ACTION', payload: { id, action: 'minimize' } }),
    maximizeWindow: (id: string) => dispatch({ type: 'WINDOW_ACTION', payload: { id, action: 'maximize' } }),
    focusWindow: (id: string) => dispatch({ type: 'WINDOW_ACTION', payload: { id, action: 'focus' } }),

    // Notifications
    addNotification: (n: Omit<Notification, 'id' | 'read' | 'timestamp'>) => dispatch({ 
        type: 'ADD_NOTIFICATION', 
        payload: { ...n, id: Date.now().toString(), read: false, timestamp: new Date() } 
    }),
    markNotificationRead: (id: string) => dispatch({ type: 'MARK_NOTIFICATION_READ', payload: id }),
    clearNotifications: () => dispatch({ type: 'CLEAR_NOTIFICATIONS' }),
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
