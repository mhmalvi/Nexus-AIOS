/**
 * Kernel Event Bridge
 *
 * Correlates send_to_kernel requests with kernel:response events
 * using request IDs. Provides Promise-based async request-response
 * pattern over the fire-and-forget Tauri IPC bridge.
 */

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: ReturnType<typeof setTimeout>;
  messageType: string;
};

class KernelEventBridge {
  private pending = new Map<string, PendingRequest>();
  private initialized = false;
  private messageTypeListeners = new Map<string, Set<(data: any) => void>>();

  async init() {
    if (this.initialized || !isTauri) return;
    this.initialized = true;

    try {
      const { listen } = await import('@tauri-apps/api/event');

      // Listen for all kernel:response events
      await listen<any>('kernel:response', (event) => {
        const payload = event.payload;
        if (!payload) return;

        const id = payload.id;
        const messageType = payload.message_type;

        // 1. Try to resolve a pending request by ID
        if (id && this.pending.has(id)) {
          const req = this.pending.get(id)!;
          clearTimeout(req.timer);
          this.pending.delete(id);
          req.resolve(payload);
          return;
        }

        // 2. Try to resolve a pending request by message_type match
        // Only matches when exactly ONE pending request has this type (avoids cross-talk)
        if (messageType) {
          const candidates: [string, PendingRequest][] = [];
          for (const [reqId, req] of this.pending) {
            if (this.isResponseType(req.messageType, messageType)) {
              candidates.push([reqId, req]);
            }
          }
          if (candidates.length === 1) {
            const [reqId, req] = candidates[0];
            clearTimeout(req.timer);
            this.pending.delete(reqId);
            req.resolve(payload);
            return;
          }
          // If multiple candidates exist, skip fallback to avoid resolving the wrong one.
          // The correct request will be resolved when its ID-matched response arrives.
        }

        // 3. Notify message_type listeners (for broadcast events)
        if (messageType && this.messageTypeListeners.has(messageType)) {
          this.messageTypeListeners.get(messageType)!.forEach(cb => cb(payload));
        }
      });
    } catch (e) {
      console.error('Failed to initialize kernel event bridge:', e);
    }
  }

  /**
   * Check if a kernel response message_type corresponds to a request message_type.
   * e.g., request "query_memory" → response "memory_results" or "query_memory"
   */
  private isResponseType(requestType: string, responseType: string): boolean {
    if (requestType === responseType) return true;
    const mapping: Record<string, string[]> = {
      'query': ['response', 'chunk'],
      'task': ['task_result'],
      'command': ['command_result', 'blocked', 'approval_required'],
      'ping': ['pong'],
      'status': ['status'],
      'query_memory': ['memory_results', 'memory_query_result'],
      'store_memory': ['memory_stored', 'memory_store_result'],
      'delete_memory': ['memory_deleted'],
      'manage_memory': ['memory_cleared'],
      'security': ['security_status', 'destruct_result', 'destruct_cancel'],
      'firewall': ['firewall_rules', 'firewall_rule_added', 'firewall_rule_deleted', 'firewall_logs', 'firewall_updated', 'firewall_status'],
      'cron': ['cron_jobs', 'cron_job_added', 'cron_job_removed', 'cron_result', 'cron_list'],
      'system_stats': ['system_stats', 'stats'],
      'intent': ['intent_result'],
      'intent_dispatch': ['intent_dispatch_result'],
      'browser': ['browser_result', 'browser_state', 'browser_action', 'browser_screenshot', 'browser_error'],
      'messaging': ['messaging_result', 'channel_list', 'message_sent', 'channel_config', 'message_history'],
      'manage_model': ['model_result', 'model_list', 'model_changed', 'model_pull_started', 'model_deleted'],
      'model_stats': ['model_stats_result', 'model_stats'],
      'index_document': ['index_result', 'index_batch_result', 'indexed_documents', 'index_deleted'],
      'update_config': ['config_updated'],
      'deep_memory': ['deep_memory_result'],
      'voice': ['transcription', 'voice_error', 'tts_complete', 'voice_status'],
      'voice_config': ['voice_config_result'],
      'approval_decision': ['approval_processed'],
      'learning_stats': ['learning_stats', 'learning_analysis', 'learning_shortcuts', 'learning_suggestions', 'learning_result'],
      'mcp_config': ['mcp_result'],
      'send_notification': ['notification_result', 'notification_status'],
      'qmd': ['qmd_results', 'qmd_created', 'qmd_updated', 'qmd_stats'],
      'plugin': ['plugin_list', 'plugin_enabled', 'plugin_disabled', 'plugin_reloaded', 'plugin_result'],
    };
    return mapping[requestType]?.includes(responseType) ?? false;
  }

  /** Default timeouts per operation type (ms) */
  private static readonly TIMEOUTS: Record<string, number> = {
    'query': 30000,
    'task': 300000,         // 5 minutes for agent tasks
    'command': 60000,       // 1 minute for commands
    'browser': 120000,      // 2 minutes for browser automation
    'index_document': 300000, // 5 minutes for document indexing
    'deep_memory': 30000,
    'voice': 60000,
    'manage_model': 120000, // 2 minutes for model operations
    'messaging': 15000,
    'query_memory': 15000,
    'store_memory': 10000,
    'cron': 10000,
    'firewall': 10000,
    'security': 10000,
    'system_stats': 10000,
    'update_config': 10000,
    'plugin': 10000,
  };

  /** Get the default timeout for a given operation type */
  private getDefaultTimeout(messageType: string): number {
    return KernelEventBridge.TIMEOUTS[messageType] ?? 30000;
  }

  /**
   * Send a message to the kernel and wait for the response.
   * Returns the full kernel response payload.
   * If no explicit timeout is given, uses per-operation defaults.
   */
  async sendAndWait(
    message: string,
    messageType: string,
    timeoutMs?: number
  ): Promise<any> {
    if (!isTauri) {
      // In browser mode, return a safe empty response (never null — callers expect .success/.data)
      return { success: false, message_type: messageType, data: null, error: 'Kernel not available in browser mode' };
    }

    await this.init();

    const { invoke } = await import('@tauri-apps/api/core');
    const response = await invoke<any>('send_to_kernel', { message, messageType });

    if (!response?.success) {
      throw new Error(response?.error || response?.message || 'Failed to dispatch to kernel');
    }

    const requestId = response?.data?.request_id;
    if (!requestId) {
      // No request ID returned, can't correlate — return the dispatch response
      return response;
    }

    // Wait for the correlated kernel:response event
    const effectiveTimeout = timeoutMs ?? this.getDefaultTimeout(messageType);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        // Don't reject — return empty result instead of crashing
        resolve({ success: false, error: 'Kernel response timeout', timed_out: true });
      }, effectiveTimeout);

      this.pending.set(requestId, { resolve, reject, timer, messageType });
    });
  }

  /**
   * Subscribe to all kernel:response events of a specific message_type.
   * Returns an unsubscribe function.
   */
  onMessageType(messageType: string, callback: (data: any) => void): () => void {
    if (!this.messageTypeListeners.has(messageType)) {
      this.messageTypeListeners.set(messageType, new Set());
    }
    this.messageTypeListeners.get(messageType)!.add(callback);
    this.init(); // ensure initialized

    return () => {
      this.messageTypeListeners.get(messageType)?.delete(callback);
    };
  }

  /** Get count of pending requests (for debugging) */
  get pendingCount() {
    return this.pending.size;
  }
}

export const kernelBridge = new KernelEventBridge();
