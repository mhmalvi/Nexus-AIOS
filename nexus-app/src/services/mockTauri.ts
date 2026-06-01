import { ThoughtEvent, ActionRequest, Agent, Notification } from '../types';

// Check if we're running in Tauri or browser
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Fallback implementations for browser mode
let listen: any;
let invoke: any;

if (isTauri) {
  // Running in Tauri - use real APIs
  const tauriEvent = await import('@tauri-apps/api/event');
  const tauriCore = await import('@tauri-apps/api/core');
  listen = tauriEvent.listen;
  invoke = tauriCore.invoke;
} else {
  // Running in browser - use mock implementations
  console.warn('🌐 Running in browser mode - using mock Tauri bridge');

  // Mock listen - just stores callbacks but can't receive real events
  const eventListeners = new Map<string, Function[]>();
  listen = async (eventName: string, callback: Function) => {
    if (!eventListeners.has(eventName)) {
      eventListeners.set(eventName, []);
    }
    eventListeners.get(eventName)!.push(callback);
    return () => {
      const listeners = eventListeners.get(eventName) || [];
      const index = listeners.indexOf(callback);
      if (index > -1) listeners.splice(index, 1);
    };
  };

  // Mock invoke - simulates kernel responses
  invoke = async (command: string, args?: any): Promise<any> => {
    console.log(`📡 [Browser Mock] invoke('${command}', ${JSON.stringify(args)})`);

    // Simulate different commands
    switch (command) {
      case 'send_to_kernel':
        const msgType = args?.messageType;
        const payload = args?.message ? JSON.parse(args.message) : {};

        // Mock Security/Firewall responses
        if (msgType === 'security') {
          if (payload.action === 'destruct_status') {
            return { success: true, message_type: 'security_status', data: { armed: true, level: 'soft_lock' } };
          }
          if (payload.action === 'initiate_destruct') {
            return { success: true, message_type: 'destruct_result', data: { status: 'COUNTDOWN', message: 'Destruct sequence initiated (Mock)' } };
          }
          if (payload.action === 'cancel_destruct') {
            return { success: true, message_type: 'destruct_cancel', data: { message: 'Sequence aborted' } };
          }
        }

        if (msgType === 'firewall') {
          if (payload.action === 'list_rules') {
            return {
              success: true,
              message_type: 'firewall_rules',
              data: {
                rules: [
                  { id: '1', pattern: '*.google.com', action: 'allow', agent_id: 'browser', description: 'Search access', hit_count: 5, created_at: Date.now() },
                  { id: '2', pattern: 'api.openai.com', action: 'allow', agent_id: 'llm', description: 'LLM API', hit_count: 12, created_at: Date.now() },
                  { id: '3', pattern: '*', action: 'deny', agent_id: '*', description: 'Default deny', hit_count: 1, created_at: Date.now() }
                ]
              }
            };
          }
          if (payload.action === 'add_rule') {
            return { success: true, message_type: 'firewall_rule_added' };
          }
          if (payload.action === 'delete_rule') {
            return { success: true, message_type: 'firewall_rule_deleted' };
          }
          if (payload.action === 'logs') {
            return {
              success: true,
              message_type: 'firewall_logs',
              data: {
                events: [
                  { url: 'https://evil.site', agent_id: 'worker', verdict: 'blocked_exfiltration', rule_id: null, method: 'POST', timestamp: Date.now() },
                  { url: 'https://api.openai.com/v1/chat', agent_id: 'llm', verdict: 'allowed', rule_id: '2', method: 'POST', timestamp: Date.now() }
                ]
              }
            };
          }
          return { success: false, error: 'Unknown firewall action' };
        }

        if (msgType === 'intent') {
          return {
            success: true,
            message_type: 'intent_result',
            data: {
              category: 'convo',
              action: payload.text?.includes('file') ? 'open_file' : 'chat',
              confidence: 0.85,
              slots: {},
              response: 'Mock intent processed',
              handler: 'mock_handler'
            }
          };
        }

        if (msgType === 'cron') {
          if (payload.action === 'list_jobs') {
            return {
              success: true,
              message_type: 'cron_list',
              data: {
                jobs: [
                  { job_id: 'cron_1', name: 'Mock Job 1', next_run: Date.now() / 1000 + 3600, status: 'active', payload: { agent: 'Manager' }, created_at: Date.now() / 1000 },
                  { job_id: 'cron_2', name: 'Mock Job 2', next_run: Date.now() / 1000 + 86400, status: 'active', payload: { agent: 'Researcher' }, created_at: Date.now() / 1000 }
                ]
              }
            };
          }
          if (payload.action === 'add_job') {
            return { success: true, message_type: 'cron_result', data: { job_id: `cron_${Date.now()}` } };
          }
          if (payload.action === 'remove_job') {
            return { success: true, message_type: 'cron_result', data: { success: true } };
          }
        }

        if (msgType === 'browser') {
          if (payload.action === 'navigate') {
            return { success: true, message_type: 'browser_result', data: { url: payload.url, title: 'Mock Browser Page', screenshot: '', text_snippet: 'Mock content for ' + payload.url } };
          }
          if (payload.action === 'screenshot') {
            return { success: true, message_type: 'browser_screenshot', data: { path: '', width: 1920, height: 1080 } };
          }
          if (payload.action === 'get_state') {
            return { success: true, message_type: 'browser_state', data: { url: 'https://mock.example', title: 'Mock Browser', tabs: [] } };
          }
          return { success: true, message_type: 'browser_action', data: { action: payload.action } };
        }

        // Default: Simulate streaming response for chat (browser-only fallback)
        setTimeout(() => {
          const response = "The AI kernel is not connected. To use AETHER, launch the desktop app with `npm run tauri dev` and ensure Ollama is running (`ollama serve`).";
          const chunks = response.split(' ');
          let fullResponse = '';

          chunks.forEach((word, i) => {
            setTimeout(() => {
              const chunk = (i === 0 ? word : ' ' + word);
              fullResponse += chunk;
              // Emit mock chunk event
              window.dispatchEvent(new CustomEvent('mock:kernel:chunk', {
                detail: { chunk }
              }));

              // Emit final response after last chunk
              if (i === chunks.length - 1) {
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('mock:kernel:response', {
                    detail: {
                      success: true,
                      message_type: 'response',
                      data: { response: fullResponse }
                    }
                  }));
                }, 100);
              }
            }, i * 50);
          });
        }, 100);

        return { success: true, message: 'Message dispatched (browser mock)' };

      case 'start_kernel':
        return { success: true, message: 'Kernel started (browser mock)', data: { status: 'running', pid: 1234 } };

      case 'stop_kernel':
        return { success: true, message: 'Kernel stopped (browser mock)' };

      case 'get_kernel_status':
        return {
          status: 'running',
          process_id: 1234,
          uptime_seconds: 3600,
          model: 'llama3:8b',
          npu_available: true,
          npu_backend: 'cuda',
          federated_learning: false,
          skills_loaded: 12,
          sandbox_available: true,
          openclaw_connected: true,
          environment: 'windows',
          security_available: true,
          self_destruct_armed: false,
          firewall: { enabled: true, rules: 3 },
          intent_dispatcher: true,
          qmd_manager: true,
          auto_reply_engine: true,
          auto_reply_commands: 42
        };

      // Memory Commands
      case 'query_memory':
        return {
          success: true,
          tier: args?.tier || 'all',
          results: [
            { id: 'mem_001', content: `Relevant info for: ${args?.query || 'query'}`, metadata: { source: 'mock' }, score: 0.95, tier: 'long_term', created_at: new Date().toISOString() },
            { id: 'mem_002', content: 'User preferences: Dark theme, verbose mode', metadata: { type: 'preference' }, score: 0.88, tier: 'persistent', created_at: new Date().toISOString() }
          ],
          total_count: 2
        };

      case 'store_memory':
        return { success: true, id: `mem_${Date.now()}`, tier: args?.tier || 'session' };

      case 'clear_memory_tier':
        return { success: true, tier: args?.tier, cleared_count: 5 };

      // Agent Commands
      case 'execute_task':
        const taskId = `task_${Date.now()}`;
        // Simulate task progress
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('mock:kernel:response', {
            detail: {
              success: true,
              message_type: 'response',
              data: { response: `Task "${args?.description}" completed successfully!` }
            }
          }));
        }, 2000);
        return { success: true, task_id: taskId, status: 'running', message: `Task started: ${args?.description}` };

      case 'get_task_status':
        return {
          task_id: args?.task_id || 'unknown',
          status: 'completed',
          description: 'Mock task execution',
          steps: [
            { id: 'step_1', action: 'Planning', status: 'completed', output: 'Plan created' },
            { id: 'step_2', action: 'Executing', status: 'completed', output: 'Action executed' }
          ],
          result: 'Task completed successfully',
          created_at: new Date(Date.now() - 60000).toISOString(),
          updated_at: new Date().toISOString()
        };

      case 'cancel_task':
        return { success: true, task_id: args?.task_id, status: 'cancelled' };

      // Safety Commands
      case 'validate_action':
        const isDestructive = args?.action?.toLowerCase().includes('delete') || args?.action?.toLowerCase().includes('rm ');
        return {
          is_safe: !isDestructive,
          risk_level: isDestructive ? 'high' : 'low',
          requires_approval: isDestructive
        };

      case 'get_audit_log':
        return {
          entries: [
            { id: 'audit_001', timestamp: new Date().toISOString(), action: 'file:read', risk_level: 'low', approved: true, details: { path: '/home/user/file.txt' } },
            { id: 'audit_002', timestamp: new Date(Date.now() - 3600000).toISOString(), action: 'shell:execute', risk_level: 'medium', approved: true, details: { command: 'ls -la' } }
          ],
          total: 2
        };

      case 'request_approval':
        // Emit mock HIL event
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('mock:hil:request', {
            detail: {
              request_id: Date.now().toString(),
              action: args?.action || 'Test Action',
              risk_level: 'medium',
              details: args?.details || {}
            }
          }));
        }, 100);
        return { success: true };

      case 'resolve_approval':
        return { success: true };

      // System Commands
      case 'get_system_info':
        return {
          os: 'Windows',
          arch: 'x86_64',
          hostname: 'nexus-workstation',
          cpu_count: 8,
          total_memory: 17179869184 // 16GB
        };

      case 'get_platform_info':
        return {
          platform: 'win32',
          version: '10.0.22631'
        };

      default:
        console.warn(`[Browser Mock] Unknown command: ${command}`);
        return { success: false, error: `Unknown command: ${command}` };
    }
  };
}

type Listener<T> = (payload: T) => void;

class MockTauriService {
  private thoughtListeners: Listener<ThoughtEvent>[] = [];
  private responseListeners: Listener<any>[] = [];
  private hilListeners: Listener<ActionRequest>[] = [];
  private agentListeners: Listener<{ id: string, updates: Partial<Agent> }>[] = [];
  private notificationListeners: Listener<Omit<Notification, 'id' | 'read' | 'timestamp'>>[] = [];
  private voiceStatusListeners: Listener<boolean>[] = [];
  private voiceTranscriptListeners: Listener<string>[] = [];
  private chunkListeners: Listener<string>[] = [];
  private taoListeners: Listener<{ type: string, content: string, step_id?: string, details?: any }>[] = [];
  private openclawListeners: Listener<any>[] = [];

  constructor() {
    this.initListeners();
  }

  private async initListeners() {
    if (isTauri) {
      console.log("🔌 Initializing Real Tauri Event Listeners...");
    } else {
      console.log("🌐 Initializing Browser Mock Event Listeners...");
    }

    // Listen for Thoughts (Kernel Output)
    await listen('kernel:thought', (event: any) => {
      this.emitThought(event.payload);
    });

    // Listen for HIL Requests from old event name
    await listen('orchestrator:approval_request', (event: any) => {
      this.emitHIL(event.payload);
    });

    // Listen for HIL Requests from new safety command
    await listen('hil:approval_required', (event: any) => {
      const payload = event.payload;
      this.emitHIL({
        id: payload.request_id,
        type: 'approval',
        command: payload.action,
        reasoning: `Risk Level: ${payload.risk_level}`,
        tool: payload.action.split(':')[0] || 'shell',
        parameters: payload.details || {},
        riskLevel: (payload.risk_level === 'critical' ? 'high' : payload.risk_level) as 'low' | 'medium' | 'high'
      });
    });

    // Listen for approval resolutions
    await listen('hil:approval_resolved', (event: any) => {
      console.log('📋 Approval resolved:', event.payload);
    });

    // Listen for Kernel Events (Responses, Stream Chunks, Events)
    await listen('kernel:response', (event: any) => {
      const payload = event.payload;

      // 1. Handle Stream Chunks
      if (payload.message_type === 'chunk') {
        const chunk = payload.data?.chunk || '';
        if (chunk) this.emitChunk(chunk);
        return;
      }

      // 2. Handle TAO Events (Thought-Action-Observation)
      if (payload.message_type === 'tao_event') {
        const taoData = payload.data;
        if (taoData) {
          this.emitTAO(taoData);
          // Also emit as a thought for the UI
          this.emitThought({
            id: payload.id || Math.random().toString(),
            timestamp: new Date(),
            component: taoData.type === 'THOUGHT' ? 'supervisor' : 'worker',
            type: taoData.type.toLowerCase() as any,
            content: taoData.content
          });
        }
        return;
      }

      // 3. Handle Custom Events (Voice, etc)
      if (payload.message_type === 'event') {
        const innerEvent = payload.data?.event;
        const innerPayload = payload.data?.payload;

        if (innerEvent === 'voice_status') {
          this.emitVoiceStatus(innerPayload.status === 'listening');
        } else if (innerEvent === 'voice_transcription') {
          this.emitVoiceTranscript(innerPayload.text);
        } else if (innerEvent === 'openclaw_message') {
          this.emitOpenClaw(innerPayload);
        }
        return;
      }

      // 3. Handle Standard Responses
      this.emitResponse(payload);

      if (!payload.success && payload.message_type !== 'chunk' && payload.message_type !== 'event') {
        this.emitThought({
          id: Math.random().toString(),
          timestamp: new Date(),
          component: 'worker',
          type: 'error',
          content: `Error: ${payload.error}`
        });
      }
    });

    // Listen for System Notifications
    await listen('system:notification', (event: any) => {
      this.emitNotification(event.payload);
    });

    // Browser-only: Listen for mock events from our mock invoke implementation
    if (!isTauri) {
      window.addEventListener('mock:kernel:chunk', ((e: CustomEvent) => {
        this.emitChunk(e.detail.chunk);
      }) as EventListener);

      window.addEventListener('mock:kernel:response', ((e: CustomEvent) => {
        this.emitResponse(e.detail);
      }) as EventListener);

      window.addEventListener('mock:hil:request', ((e: CustomEvent) => {
        const detail = e.detail;
        this.emitHIL({
          id: detail.request_id,
          type: 'approval',
          command: detail.action,
          reasoning: `Risk Level: ${detail.risk_level}`,
          tool: detail.action.split(':')[0] || 'shell',
          parameters: detail.details || {},
          riskLevel: (detail.risk_level === 'critical' ? 'high' : detail.risk_level) as 'low' | 'medium' | 'high'
        });
      }) as EventListener);
    }
  }

  subscribeResponse(callback: Listener<any>) {
    this.responseListeners.push(callback);
    return () => { this.responseListeners = this.responseListeners.filter(l => l !== callback); };
  }

  subscribeThought(callback: Listener<ThoughtEvent>) {
    this.thoughtListeners.push(callback);
    return () => { this.thoughtListeners = this.thoughtListeners.filter(l => l !== callback); };
  }

  subscribeHIL(callback: Listener<ActionRequest>) {
    this.hilListeners.push(callback);
    return () => { this.hilListeners = this.hilListeners.filter(l => l !== callback); };
  }

  subscribeAgentUpdate(callback: Listener<{ id: string, updates: Partial<Agent> }>) {
    this.agentListeners.push(callback);
    return () => { this.agentListeners = this.agentListeners.filter(l => l !== callback); };
  }

  subscribeNotification(callback: Listener<Omit<Notification, 'id' | 'read' | 'timestamp'>>) {
    this.notificationListeners.push(callback);
    return () => { this.notificationListeners = this.notificationListeners.filter(l => l !== callback); };
  }

  subscribeVoiceStatus(callback: Listener<boolean>) {
    this.voiceStatusListeners.push(callback);
    return () => { this.voiceStatusListeners = this.voiceStatusListeners.filter(l => l !== callback); };
  }

  subscribeVoiceTranscript(callback: Listener<string>) {
    this.voiceTranscriptListeners.push(callback);
    return () => { this.voiceTranscriptListeners = this.voiceTranscriptListeners.filter(l => l !== callback); };
  }

  subscribeChunk(callback: Listener<string>) {
    this.chunkListeners.push(callback);
    return () => { this.chunkListeners = this.chunkListeners.filter(l => l !== callback); };
  }

  subscribeTAO(callback: Listener<{ type: string, content: string, step_id?: string, details?: any }>) {
    this.taoListeners.push(callback);
    return () => { this.taoListeners = this.taoListeners.filter(l => l !== callback); };
  }

  subscribeOpenClaw(callback: Listener<any>) {
    this.openclawListeners.push(callback);
    return () => { this.openclawListeners = this.openclawListeners.filter(l => l !== callback); };
  }

  private emitResponse(response: any) {
    this.responseListeners.forEach(l => l(response));
  }

  private emitThought(thought: ThoughtEvent) {
    this.thoughtListeners.forEach(l => l(thought));
  }

  private emitHIL(action: ActionRequest) {
    this.hilListeners.forEach(l => l(action));
  }

  private emitAgentUpdate(payload: { id: string, updates: Partial<Agent> }) {
    this.agentListeners.forEach(l => l(payload));
  }

  private emitNotification(payload: Omit<Notification, 'id' | 'read' | 'timestamp'>) {
    this.notificationListeners.forEach(l => l(payload));
  }

  private emitVoiceStatus(isListening: boolean) {
    this.voiceStatusListeners.forEach(l => l(isListening));
  }

  private emitVoiceTranscript(text: string) {
    this.voiceTranscriptListeners.forEach(l => l(text));
  }

  private emitChunk(chunk: string) {
    this.chunkListeners.forEach(l => l(chunk));
  }

  private emitTAO(tao: { type: string, content: string, step_id?: string, details?: any }) {
    this.taoListeners.forEach(l => l(tao));
  }

  private emitOpenClaw(payload: any) {
    this.openclawListeners.forEach(l => l(payload));
  }

  // Debug / Manual Triggers
  async triggerHIL() {
    // Invoke request_approval to test the HIL flow
    await invoke('request_approval', {
      action: 'Test Action: Delete temporary files',
      details: { test: true, triggered_by: 'user' }
    });
  }

  // Main methods to interact with backend
  async sendQuery(query: string) {
    // Wrap query in JSON to match kernel payload expectation
    return await invoke('send_to_kernel', {
      message: JSON.stringify({ query }),
      messageType: 'query'
    });
  }

  async triggerVoiceListening() {
    console.log("🎤 Manually triggering voice listening...");
    return await invoke('send_to_kernel', {
      message: JSON.stringify({ action: "listen", duration: 7.0 }),
      messageType: 'voice'
    });
  }

  async executeAction(requestId: string, approved: boolean, reason?: string) {
    return await invoke('resolve_approval', {
      requestId,
      approved,
      reason: reason || null
    });
  }

  // Memory API
  async queryMemory(query: string, tier?: string, limit?: number) {
    return await invoke('query_memory', { query, tier, limit });
  }

  async storeMemory(content: string, tier: string, metadata?: Record<string, any>) {
    return await invoke('store_memory', { content, tier, metadata });
  }

  async clearMemoryTier(tier: string) {
    return await invoke('clear_memory_tier', { tier });
  }

  // Agent API
  async executeTask(description: string, autoApprove?: boolean) {
    return await invoke('execute_task', { description, auto_approve: autoApprove });
  }

  async getTaskStatus(taskId: string) {
    return await invoke('get_task_status', { task_id: taskId });
  }

  async cancelTask(taskId: string) {
    return await invoke('cancel_task', { task_id: taskId });
  }

  // Safety API
  async validateAction(action: string, details?: Record<string, any>) {
    return await invoke('validate_action', { action, details });
  }

  async getAuditLog(limit?: number, offset?: number) {
    return await invoke('get_audit_log', { limit, offset });
  }

  // System API
  async getSystemInfo() {
    return await invoke('get_system_info');
  }

  async getPlatformInfo() {
    return await invoke('get_platform_info');
  }

  async getKernelStatus() {
    return await invoke('get_kernel_status');
  }

  async startKernel() {
    return await invoke('start_kernel');
  }

  async stopKernel() {
    return await invoke('stop_kernel');
  }
}

export const mockTauri = new MockTauriService();

