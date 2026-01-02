
import React, { useEffect } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { VoiceIndicator } from './components/voice/VoiceIndicator';
import { HILModal } from './components/agent/ActionApproval';
import { useStore } from './context/StoreContext';
import { mockTauri } from './services/mockTauri';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

function App() {
  const { 
    agent, 
    addThought, 
    pendingAction, 
    setPendingAction,
    addMessage,
    startListening,
    stopListening
  } = useStore();

  useEffect(() => {
    // Subscribe to simulated backend events
    const unsubThoughts = mockTauri.subscribeThought((thought) => {
      addThought(thought);
    });

    const unsubHIL = mockTauri.subscribeHIL((action) => {
      setPendingAction(action);
    });

    return () => {
      unsubThoughts();
      unsubHIL();
    };
  }, [addThought, setPendingAction]);

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
    <ErrorBoundary>
      <MainLayout />
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
    </ErrorBoundary>
  );
}

export default App;
