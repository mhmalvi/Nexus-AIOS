
import React, { useEffect } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { VoiceIndicator } from './components/voice/VoiceIndicator';
import { HILModal } from './components/agent/ActionApproval';
import { GhostCommandBar } from './components/command/GhostCommandBar';
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
    addNotification
  } = useStore();

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

    return () => {
      unsubThoughts();
      unsubHIL();
      unsubAgents();
      unsubNotify();
    };
  }, [addThought, setPendingAction, updateAgentStatus, addNotification]);

  const handleApproveAction = (action: any) => {
    setPendingAction(null);
    addMessage({
        id: Date.now().toString(),
        role: 'system',
        content: `ACTION APPROVED: Executing ${action.tool} command via secure channel.`,
        timestamp: new Date()
    });
    // Simulate result thought
    setTimeout(() => {
        addThought({
            id: Date.now().toString(),
            timestamp: new Date(),
            type: 'observation',
            component: 'worker',
            content: `Execution successful. Output code: 0. Resources freed.`
        });
    }, 1000);
  };

  const handleDenyAction = () => {
    setPendingAction(null);
    addMessage({
        id: Date.now().toString(),
        role: 'system',
        content: `ACTION DENIED: Operation cancelled by user.`,
        timestamp: new Date()
    });
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

  return (
    <>
      <MainLayout />
      <GhostCommandBar />
      <VoiceIndicator 
        isListening={agent.isListening}
        transcript={agent.transcript}
      />
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
