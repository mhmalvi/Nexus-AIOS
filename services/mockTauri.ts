
import { ThoughtEvent, ActionRequest } from '../types';

type Listener<T> = (payload: T) => void;

class MockTauriService {
  private thoughtListeners: Listener<ThoughtEvent>[] = [];
  private hilListeners: Listener<ActionRequest>[] = [];
  private voiceListeners: Listener<{isListening: boolean, volume: number}>[] = [];
  private intervals: number[] = [];

  constructor() {
    this.startSimulation();
  }

  subscribeThought(callback: Listener<ThoughtEvent>) {
    this.thoughtListeners.push(callback);
    return () => {
      this.thoughtListeners = this.thoughtListeners.filter(l => l !== callback);
    };
  }

  subscribeHIL(callback: Listener<ActionRequest>) {
    this.hilListeners.push(callback);
    return () => {
      this.hilListeners = this.hilListeners.filter(l => l !== callback);
    };
  }

  subscribeVoice(callback: Listener<{isListening: boolean, volume: number}>) {
    this.voiceListeners.push(callback);
    return () => {
      this.voiceListeners = this.voiceListeners.filter(l => l !== callback);
    };
  }

  private startSimulation() {
    // Simulate complex architectural workflow
    // Flow: Scheduler -> Memory -> Worker -> Supervisor
    
    let step = 0;
    
    const thoughtInterval = window.setInterval(() => {
      const now = new Date();
      const id = Math.random().toString(36).substr(2, 9);
      
      // Simulate a structured thought chain based on architecture diagrams
      if (Math.random() > 0.6) {
          switch(step % 5) {
              case 0:
                  this.emitThought({
                      id, timestamp: now, component: 'scheduler', type: 'thought',
                      content: "Context Scheduler: Analyzing user intent. Initiating Hybrid Search in Tier 3 memory."
                  });
                  break;
              case 1:
                   this.emitThought({
                      id, timestamp: now, component: 'memory', type: 'thought',
                      content: "Memory Manager: Retrieving vectors [vec-891, vec-221]. Re-ranking results based on recency."
                  });
                  break;
              case 2:
                  this.emitThought({
                      id, timestamp: now, component: 'scheduler', type: 'thought',
                      content: "Context Scheduler: Pruning context window. Injecting 3 RAG chunks into Tier 1 Working Memory."
                  });
                  break;
              case 3:
                  this.emitThought({
                      id, timestamp: now, component: 'worker', type: 'thought',
                      content: "Worker Agent: Generating execution plan. Selected tools: [FileSystem, PythonInterpreter]."
                  });
                  break;
              case 4:
                  this.emitThought({
                      id, timestamp: now, component: 'supervisor', type: 'thought',
                      content: "Agentic Supervisor: Auditing plan for safety constraints. \nResult: SAFE. Alignment Score: 0.98."
                  });
                  break;
          }
          step++;
      }
    }, 2500);

    // Simulate occasional HIL request
    const hilInterval = window.setInterval(() => {
      if (Math.random() > 0.95) {
        this.emitHIL(this.generateRandomAction());
      }
    }, 15000);

    this.intervals.push(thoughtInterval, hilInterval);
  }

  private emitThought(thought: ThoughtEvent) {
    this.thoughtListeners.forEach(l => l(thought));
  }

  private emitHIL(action: ActionRequest) {
    this.hilListeners.forEach(l => l(action));
  }

  triggerHIL() {
    this.emitHIL(this.generateRandomAction());
  }

  private generateRandomAction(): ActionRequest {
    const tools = ['shell', 'fs', 'network', 'deployment'];
    const tool = tools[Math.floor(Math.random() * tools.length)];
    const risks: ActionRequest['riskLevel'][] = ['low', 'medium', 'high'];
    
    return {
      id: Math.random().toString(36).substr(2, 9),
      type: 'execute',
      command: tool === 'shell' ? 'rm -rf /tmp/cache' : 'deploy --force production',
      tool: tool,
      reasoning: "Operation required to clear system buffers and free up resources for high-priority task.",
      parameters: { force: true, recursive: true, path: "/tmp/cache" },
      riskLevel: risks[Math.floor(Math.random() * risks.length)]
    };
  }
}

export const mockTauri = new MockTauriService();