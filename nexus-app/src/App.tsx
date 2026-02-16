
import React, { useEffect, useState, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { MainLayout } from './components/layout/MainLayout';
import { VoiceOrb } from './components/voice/VoiceOrb';
import { HILModal } from './components/agent/ActionApproval';
import { AetherCommandBar } from './components/command/AetherCommandBar';
import { AetherAwakening } from './components/setup/AetherAwakening';
import { ProviderSetup } from './components/setup/ProviderSetup';
import { Onboarding } from './components/setup/Onboarding';
import { useStore } from './context/StoreContext';
import { mockTauri } from './services/mockTauri';

function App() {
  const {
    agent,
    addThought,
    pendingAction,
    setPendingAction,
    addMessage,
    updateAgentStatus,
    addNotification,
    startListening,
    stopListening,
    setTranscript,
    updateMessage,
    setSpeaking
  } = useStore();

  const [booted, setBooted] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const streamingIdRef = useRef<string | null>(null);
  const streamContentRef = useRef<string>("");

  useEffect(() => {
    // Subscribe to simulated backend events
    const unsubThoughts = mockTauri.subscribeThought((thought) => {
      addThought(thought);
    });

    const unsubHIL = mockTauri.subscribeHIL((action) => {
      setPendingAction(action);
    });

    const unsubAgents = mockTauri.subscribeAgentUpdate((payload) => {
      updateAgentStatus(payload.id, payload.updates);
    });

    const unsubNotify = mockTauri.subscribeNotification((notification) => {
      addNotification(notification);
    });

    const unsubChunk = mockTauri.subscribeChunk((chunk) => {
      let id = streamingIdRef.current;
      if (!id) {
        id = Date.now().toString();
        streamingIdRef.current = id;
        streamContentRef.current = "";
        addMessage({
          id,
          role: 'assistant',
          content: '',
          timestamp: new Date()
        });
      }
      streamContentRef.current += chunk;
      updateMessage(id, streamContentRef.current);
    });

    const unsubResponses = mockTauri.subscribeResponse((res) => {
      // Handle completion of streamed response or new standalone response
      if (res.message_type === 'response') {
        if (streamingIdRef.current) {
          if (res.data?.response) {
            updateMessage(streamingIdRef.current, res.data.response);
          }
          streamingIdRef.current = null;
          streamContentRef.current = "";
        } else if (res.success && res.data?.response) {
          addMessage({
            id: Date.now().toString(),
            role: 'assistant',
            content: res.data.response,
            timestamp: new Date()
          });
        }
      } else if (!res.success && res.message_type !== 'chunk') {
        addMessage({
          id: Date.now().toString(),
          role: 'system',
          content: `⚠️ Kernel Error: ${res.error || "Operation failed."}`,
          timestamp: new Date()
        });
      }
    });

    const unsubVoiceStatus = mockTauri.subscribeVoiceStatus((payload: any) => {
      if (typeof payload === 'boolean') {
        if (payload) startListening();
        else stopListening();
      } else if (payload && typeof payload === 'object') {
        if (payload.status === 'listening') startListening();
        if (payload.status === 'speaking') setSpeaking(true);
        if (payload.status === 'idle') {
          stopListening();
          setSpeaking(false);
        }
      }
    });

    const unsubVoiceTranscript = mockTauri.subscribeVoiceTranscript((text: string) => {
      setTranscript(text);
    });

    return () => {
      unsubThoughts();
      unsubHIL();
      unsubAgents();
      unsubNotify();
      unsubResponses();
      unsubVoiceStatus();
      unsubVoiceTranscript();
      unsubChunk();
    };
  }, [addThought, setPendingAction, updateAgentStatus, addNotification, addMessage, startListening, stopListening, setTranscript, updateMessage]);

  // Check Onboarding & Ollama status on boot
  useEffect(() => {
    if (booted) {
      // 1. Check Onboarding
      const isSetup = localStorage.getItem('nexus_setup_complete');
      if (!isSetup) {
        setShowOnboarding(true);
      }

      // 2. Check Ollama
      import('@tauri-apps/api/core').then(async ({ invoke }) => {
        try {
          const status = await invoke<{ installed: boolean, models: string[] }>('check_ollama_installed');
          if (!status.installed || status.models.length === 0) {
            setShowSetup(true);
          }
        } catch (e) {
          console.warn("Failed to check Ollama status (might be in browser mode):", e);
        }
      });

      // 3. Auto-start the Python kernel with stage toasts
      addNotification({
        title: "Kernel Starting",
        message: "Initializing AetherOS neural kernel...",
        type: "info"
      });

      import('./services/tauriApi').then(async ({ kernelApi }) => {
        try {
          const status = await kernelApi.getStatus();
          if (status.status !== 'running') {
            console.log("Auto-starting kernel...");
            const result = await kernelApi.start();
            if (result.success) {
              addNotification({
                title: "Voice Engine Loading",
                message: "Kernel online. Loading voice subsystem...",
                type: "info"
              });
              // Brief delay before "ready" toast
              setTimeout(() => {
                addNotification({
                  title: "Kernel Ready",
                  message: "AetherOS neural kernel is fully online.",
                  type: "success"
                });
              }, 1500);
            } else {
              addNotification({
                title: "Kernel Failed",
                message: result.message || "Could not start kernel. Check Python/WSL setup.",
                type: "error"
              });
            }
          } else {
            addNotification({
              title: "Kernel Ready",
              message: "AetherOS neural kernel is already online.",
              type: "success"
            });
          }
        } catch (e) {
          console.warn("Failed to auto-start kernel:", e);
          addNotification({
            title: "Kernel Offline",
            message: "Running in demo mode. Start kernel manually for full functionality.",
            type: "warning"
          });
        }
      });
    }
  }, [booted, addNotification]);

  // Kernel health monitoring — poll every 10s
  useEffect(() => {
    if (!booted) return;
    let active = true;
    const checkHealth = async () => {
      try {
        const { kernelApi } = await import('./services/tauriApi');
        const status = await kernelApi.getStatus();
        if (active && status.status === 'error') {
          addNotification({ title: 'Kernel Error', message: 'Kernel reported an error state. Attempting restart...', type: 'error' });
          await kernelApi.start();
        }
      } catch { /* ignore in browser mode */ }
    };
    const interval = setInterval(checkHealth, 10000);
    return () => { active = false; clearInterval(interval); };
  }, [booted, addNotification]);

  // Listen for global shortcut (Alt+Space) from Tauri backend
  const { isGhostBarOpen, setGhostBarOpen } = useStore();

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<string>('global-shortcut-triggered', (event) => {
      if (event.payload === 'Alt+Space') {
        setGhostBarOpen(!isGhostBarOpen);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [isGhostBarOpen, setGhostBarOpen]);

  const handleApproveAction = async (action: any) => {
    setPendingAction(null);

    // Call backend to resolve the approval
    try {
      await mockTauri.executeAction(action.id, true, 'Architect granted');
      addMessage({
        id: Date.now().toString(),
        role: 'system',
        content: `✅ ACTION GRANTED: Executing ${action.tool} command via secure channel.`,
        timestamp: new Date()
      });
      // Result will come from kernel:response event
    } catch (error) {
      addMessage({
        id: Date.now().toString(),
        role: 'system',
        content: `⚠️ Failed to approve action: ${error}`,
        timestamp: new Date()
      });
    }
  };

  const handleDenyAction = async () => {
    const action = pendingAction;
    setPendingAction(null);

    // Call backend to deny the approval
    try {
      if (action?.id) {
        await mockTauri.executeAction(action.id, false, 'Architect withheld');
      }
      addMessage({
        id: Date.now().toString(),
        role: 'system',
        content: `❌ ACTION WITHHELD: Operation cancelled by Architect.`,
        timestamp: new Date()
      });
    } catch (error) {
      addMessage({
        id: Date.now().toString(),
        role: 'system',
        content: `ACTION WITHHELD: Operation cancelled by Architect.`,
        timestamp: new Date()
      });
    }
  };

  // Trigger a demo HIL event on 'H' key press for review purposes
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'h' && e.ctrlKey) {
        mockTauri.triggerHIL();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  if (!booted) {
    return <AetherAwakening onComplete={() => setBooted(true)} />;
  }

  return (
    <>
      {showSetup && (
        <ProviderSetup
          onComplete={() => setShowSetup(false)}
          onSkip={() => setShowSetup(false)}
        />
      )}
      <MainLayout />
      <AetherCommandBar />
      <div className="fixed bottom-8 right-8 z-50">
        <VoiceOrb onClick={() => agent.isListening ? stopListening() : startListening()} />
      </div>
      <HILModal
        open={!!pendingAction}
        action={pendingAction}
        onClose={handleDenyAction}
        onApprove={handleApproveAction}
        onDeny={handleDenyAction}
      />
    </>
  );
}

export default App;
