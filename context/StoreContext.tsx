
import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { AppState, ThoughtEvent, ActionRequest, Message, UISettings, Artifact } from '../types';

interface StoreContextType extends AppState {
  setTheme: (theme: AppState['ui']['theme']) => void;
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
  spawnArtifact: (artifact: Artifact) => void;
  closeArtifact: (id: string) => void;
  thoughtStream: ThoughtEvent[];
  isCommandPaletteOpen: boolean;
}

const getInitialTheme = (): UISettings['theme'] => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('nexus_theme') as UISettings['theme'];
    if (saved) return saved;
  }
  return 'dark'; // Default to dark for OS feel
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
      content: 'Nexus AIOS Kernel v2.4 initialized. Workspace ready.',
      timestamp: new Date(),
      tool: 'terminal'
    }
  ],
  pendingAction: null,
  artifacts: []
};

type Action =
  | { type: 'SET_THEME'; payload: AppState['ui']['theme'] }
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
  | { type: 'SPAWN_ARTIFACT'; payload: Artifact }
  | { type: 'CLOSE_ARTIFACT'; payload: string };

const StoreContext = createContext<StoreContextType | undefined>(undefined);

function storeReducer(state: AppState & { thoughtStream: ThoughtEvent[], isCommandPaletteOpen: boolean }, action: Action) {
  switch (action.type) {
    case 'SET_THEME':
      return { ...state, ui: { ...state.ui, theme: action.payload } };
    case 'ADD_HISTORY':
      if (state.commandHistory[0] === action.payload) return state;
      return { ...state, commandHistory: [action.payload, ...state.commandHistory].slice(0, 99) };
    case 'ADD_MESSAGE':
      return { ...state, activeConversation: [...state.activeConversation, action.payload] };
    case 'TOGGLE_REACTION':
      return {
        ...state,
        activeConversation: state.activeConversation.map(msg => {
          if (msg.id === action.payload.messageId) {
            const currentReactions = msg.reactions || [];
            const hasReaction = currentReactions.includes(action.payload.reaction);
            return {
              ...msg,
              reactions: hasReaction 
                ? currentReactions.filter(r => r !== action.payload.reaction)
                : [...currentReactions, action.payload.reaction]
            };
          }
          return msg;
        })
      };
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
    case 'SPAWN_ARTIFACT':
      // Prevent duplicate IDs
      if (state.artifacts.some(a => a.id === action.payload.id)) return state;
      return { ...state, artifacts: [...state.artifacts, action.payload] };
    case 'CLOSE_ARTIFACT':
      return { ...state, artifacts: state.artifacts.filter(a => a.id !== action.payload) };
    default:
      return state;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(storeReducer, { ...initialState, thoughtStream: [], isCommandPaletteOpen: false });

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
    const handleSystemChange = () => {
      if (state.ui.theme === 'system') {
        applyTheme();
      }
    };
    mediaQuery.addEventListener('change', handleSystemChange);
    return () => mediaQuery.removeEventListener('change', handleSystemChange);
  }, [state.ui.theme]);

  const setTheme = (theme: AppState['ui']['theme']) => {
    localStorage.setItem('nexus_theme', theme);
    dispatch({ type: 'SET_THEME', payload: theme });
  };

  const value = {
    ...state,
    setTheme,
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
    spawnArtifact: (artifact: Artifact) => dispatch({ type: 'SPAWN_ARTIFACT', payload: artifact }),
    closeArtifact: (id: string) => dispatch({ type: 'CLOSE_ARTIFACT', payload: id }),
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
