
import { ThoughtEvent, ActionRequest, Agent, Notification } from '../types';

type Listener<T> = (payload: T) => void;

class MockTauriService {
  private thoughtListeners: Listener<ThoughtEvent>[] = [];
  private hilListeners: Listener<ActionRequest>[] = [];
  private voiceListeners: Listener<{isListening: boolean, volume: number}>[] = [];
  private agentListeners: Listener<{id: string, updates: Partial<Agent>}>[] = [];
  private notificationListeners: Listener<Omit<Notification, 'id' | 'read' | 'timestamp'>>[] = [];
  
  private intervals: number[] = [];

  constructor() {
    this.startSimulation();
  }

  subscribeThought(callback: Listener<ThoughtEvent>) {
    this.thoughtListeners.push(callback);
    return () => { this.thoughtListeners = this.thoughtListeners.filter(l => l !== callback); };
  }

  subscribeHIL(callback: Listener<ActionRequest>) {
    this.hilListeners.push(callback);
    return () => { this.hilListeners = this.hilListeners.filter(l => l !== callback); };
  }

  subscribeVoice(callback: Listener<{isListening: boolean, volume: number}>) {
    this.voiceListeners.push(callback);
    return () => { this.voiceListeners = this.voiceListeners.filter(l => l !== callback); };
  }
  
  subscribeAgentUpdate(callback: Listener<{id: string, updates: Partial<Agent>}>) {
    this.agentListeners.push(callback);
    return () => { this.agentListeners = this.agentListeners.filter(l => l !== callback); };
  }

  subscribeNotification(callback: Listener<Omit<Notification, 'id' | 'read' | 'timestamp'>>) {
    this.notificationListeners.push(callback);
    return () => { this.notificationListeners = this.notificationListeners.filter(l => l !== callback); };
  }

  private startSimulation() {
    // 1. Thought Stream Simulation (Swarm Chatter)
    const thoughtInterval = window.setInterval(() => {
      if (Math.random() > 0.6) {
          const swarmEvents = [
              { component: 'sec-ops', content: "SecOps: Packet signature verified. eBPF hook active." },
              { component: 'scheduler', content: "Orchestrator: Delegating optimization task to DevArch." },
              { component: 'dev-arch', content: "DevArch: Compiling TypeScript definitions... Cache hit." },
              { component: 'data-analyst', content: "Analyst: Updating context vector index [Tier 2]." }
          ];
          const event = swarmEvents[Math.floor(Math.random() * swarmEvents.length)];
          
          this.emitThought({
              id: Math.random().toString(36).substr(2, 9), 
              timestamp: new Date(), 
              component: event.component as any, 
              type: 'thought',
              content: event.content
          });
      }
    }, 3500);

    // 2. Agent Status Rotation (Visual feedback in Swarm Cluster)
    const agentInterval = window.setInterval(() => {
        const agents = ['sec-ops', 'dev-arch', 'analyst'];
        const agentId = agents[Math.floor(Math.random() * agents.length)];
        const statuses: Agent['status'][] = ['thinking', 'executing', 'idle', 'reviewing'];
        const tasks = [
            'Indexing vectors', 'Scanning network', 'Compiling modules', 'Garbage collection', 'Idle'
        ];
        
        this.emitAgentUpdate({
            id: agentId,
            updates: {
                status: statuses[Math.floor(Math.random() * statuses.length)],
                currentTask: tasks[Math.floor(Math.random() * tasks.length)],
                confidence: Math.floor(Math.random() * 20) + 80
            }
        });
    }, 2000);

    // 3. Proactive Insights (Predictive Workflow)
    const insightInterval = window.setInterval(() => {
        if (Math.random() > 0.8) {
            const insights = [
                { title: "Context Anticipated", message: "Pre-loaded 'Project Alpha' docs based on your calendar." },
                { title: "Resource Optimization", message: "Shifted heavy inference to NPU to save battery." },
                { title: "Security Alert", message: "Prevented 3 unauthorized connection attempts via eBPF." }
            ];
            const i = insights[Math.floor(Math.random() * insights.length)];
            
            this.emitNotification({
                title: i.title,
                message: i.message,
                type: 'insight'
            });
        }
    }, 12000);

    this.intervals.push(thoughtInterval, agentInterval, insightInterval);
  }

  private emitThought(thought: ThoughtEvent) {
    this.thoughtListeners.forEach(l => l(thought));
  }

  private emitHIL(action: ActionRequest) {
    this.hilListeners.forEach(l => l(action));
  }
  
  private emitAgentUpdate(payload: {id: string, updates: Partial<Agent>}) {
      this.agentListeners.forEach(l => l(payload));
  }

  private emitNotification(payload: Omit<Notification, 'id' | 'read' | 'timestamp'>) {
      this.notificationListeners.forEach(l => l(payload));
  }

  triggerHIL() {
    this.emitHIL({
      id: Math.random().toString(36).substr(2, 9),
      type: 'execute',
      command: 'rm -rf /tmp/cache',
      tool: 'fs',
      reasoning: "Operation required to clear system buffers.",
      parameters: { force: true },
      riskLevel: 'medium'
    });
  }
}

export const mockTauri = new MockTauriService();
