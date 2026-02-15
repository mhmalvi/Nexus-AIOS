/**
 * Tauri API Service
 * 
 * Centralized, typed API for all Tauri backend commands.
 * Auto-detects Tauri environment and provides mock fallbacks for browser mode.
 */

// Type definitions for API responses
export interface KernelStatus {
    status: 'stopped' | 'starting' | 'running' | 'error';
    process_id?: number;
    uptime_seconds?: number;
    // Enhanced status fields
    model?: string;
    memory_stats?: Record<string, any>;
    toolbox_tools?: string[];
    voice_available?: boolean;
    voice_enabled?: boolean;
    npu_available?: boolean;
    npu_backend?: string;
    federated_learning?: boolean;
    skills_loaded?: number;
    sandbox_available?: boolean;
    openclaw_connected?: boolean;
    environment?: string;
    security_available?: boolean;
    self_destruct_armed?: boolean; // mapped from self_destruct != None
    firewall?: Record<string, any>;
    intent_dispatcher?: boolean;
    qmd_manager?: boolean;
    auto_reply_engine?: boolean;
    auto_reply_commands?: number;
}

export interface ModelStats {
    default_model?: string;
    llm_routing_enabled?: boolean;
    active_models?: string[];
    installed_models?: string[];
    request_count?: number;
}

export interface KernelResponse {
    id?: string;
    success: boolean;
    message_type?: string;
    message?: string;
    error?: string;
    data?: any;
}

export interface MemoryEntry {
    id: string;
    content: string;
    metadata: Record<string, any>;
    score: number;
    tier: string;
    created_at: string;
    // H-MEM fields
    domain?: string;
    category?: string;
    abstraction_level?: number;
}

export interface MemoryQueryResult {
    success: boolean;
    tier: string;
    results: MemoryEntry[];
    total_count: number;
}

export interface MemoryStoreResult {
    success: boolean;
    id: string;
    tier: string;
}

export interface TaskExecuteResult {
    success: boolean;
    task_id: string;
    status: string;
    message: string;
}

export interface TaskStepInfo {
    id: string;
    action: string;
    status: string;
    output?: string;
}

export interface TaskStatusResult {
    task_id: string;
    status: string;
    description: string;
    steps: TaskStepInfo[];
    result?: string;
    created_at: string;
    updated_at: string;
}

export interface SystemInfo {
    os: string;
    kernel_version: string;
    uptime: number;
    cpu_count: number;
    total_memory: number;
    used_memory: number;
}

export interface AuditLogEntry {
    id: string;
    timestamp: string;
    action: string;
    risk_level: string;
    approved: boolean;
    details: Record<string, any>;
}

export interface FileEntry {
    name: string;
    isDirectory: boolean;
    isFile: boolean;
    path: string;
}

export interface FsApi {
    readDir: (path: string) => Promise<FileEntry[]>;
    readTextFile: (path: string) => Promise<string>;
    writeTextFile: (path: string, contents: string) => Promise<void>;
    mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
    rename: (oldPath: string, newPath: string) => Promise<void>;
    remove: (path: string, options?: { recursive?: boolean }) => Promise<void>;
}

import { kernelBridge } from './kernelEventBridge';

// Check if running in Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Internal API holders
let invokeFn: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
let fsFn: FsApi | null = null;
let convertFileSrcFn: (filePath: string) => string = (path) => path;

// Initialization Promise
const initPromise = (async () => {
    if (isTauri) {
        try {
            const core = await import('@tauri-apps/api/core');
            invokeFn = core.invoke;
            if (core.convertFileSrc) convertFileSrcFn = core.convertFileSrc;

            const fsModule = await import('@tauri-apps/plugin-fs');
            fsFn = {
                readDir: async (path) => {
                    const entries = await fsModule.readDir(path);
                    return entries.map(e => ({
                        name: e.name,
                        isDirectory: e.isDirectory,
                        isFile: e.isFile,
                        path: path.endsWith('/') || path.endsWith('\\') ? path + e.name : path + '/' + e.name
                    }));
                },
                readTextFile: fsModule.readTextFile,
                writeTextFile: fsModule.writeTextFile,
                mkdir: fsModule.mkdir,
                rename: fsModule.rename,
                remove: fsModule.remove
            };
            console.log("🔌 Tauri API initialized successfully.");
        } catch (e) {
            console.error("❌ Failed to initialize Tauri API:", e);
            throw e;
        }
    } else {
        // Mock implementation for browser mode
        invokeFn = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
            console.log(`[Browser Mock] ${cmd}`, args);
            return getMockResponse(cmd, args) as T;
        };

        fsFn = {
            readDir: async (path) => {
                console.log(`[Browser Mock] readDir(${path})`);
                // Mock common directories
                if (path === '/' || path === '' || path === '.') {
                    return [
                        { name: 'home', isDirectory: true, isFile: false, path: '/home' },
                        { name: 'sys', isDirectory: true, isFile: false, path: '/sys' }
                    ];
                }
                if (path.includes('home')) {
                    return [
                        { name: 'documents', isDirectory: true, isFile: false, path: path + '/documents' },
                        { name: 'notes.txt', isDirectory: false, isFile: true, path: path + '/notes.txt' }
                    ];
                }
                return [];
            },
            readTextFile: async (path) => {
                console.log(`[Browser Mock] readTextFile(${path})`);
                return "Mock file content for " + path;
            },
            writeTextFile: async (path, contents) => {
                console.log(`[Browser Mock] writeTextFile(${path})`, contents);
            },
            mkdir: async (path, options) => {
                console.log(`[Browser Mock] mkdir(${path})`, options);
            },
            rename: async (oldPath, newPath) => {
                console.log(`[Browser Mock] rename(${oldPath} -> ${newPath})`);
            },
            remove: async (path, options) => {
                console.log(`[Browser Mock] remove(${path})`, options);
            }
        };
        console.log("🌐 Browser Mock API initialized.");
    }
})();

// Helper to ensure initialization
async function getInvoke() {
    await initPromise;
    if (!invokeFn) throw new Error("Tauri API not initialized");
    return invokeFn;
}

// Helper to ensure filesystem
async function getFs() {
    await initPromise;
    return fsFn;
}

// Mock responses for browser mode
function getMockResponse(cmd: string, args?: Record<string, unknown>): any {
    switch (cmd) {
        case 'get_kernel_status':
            return { status: 'running', process_id: 1234, uptime_seconds: 3600 };

        case 'start_kernel':
            return { success: true, message: 'Kernel started (mock)', data: { status: 'running', pid: 1234 } };

        case 'stop_kernel':
            return { success: true, message: 'Kernel stopped (mock)' };

        case 'query_memory':
            return {
                success: true,
                tier: args?.tier || 'all',
                results: [
                    { id: 'mem_001', content: 'Sample memory entry', metadata: {}, score: 0.95, tier: 'long_term', created_at: new Date().toISOString() }
                ],
                total_count: 1
            };

        case 'store_memory':
            return { success: true, id: `mem_${Date.now()}`, tier: args?.tier || 'session' };

        case 'clear_memory_tier':
            return { success: true, tier: args?.tier, cleared_count: 0 };

        case 'execute_task':
            return { success: true, task_id: `task_${Date.now()}`, status: 'running', message: 'Task started (mock)' };

        case 'get_task_status':
            return {
                task_id: args?.task_id || 'unknown',
                status: 'completed',
                description: 'Mock task',
                steps: [],
                result: 'Task completed successfully',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

        case 'cancel_task':
            return { success: true, task_id: args?.task_id, status: 'cancelled' };

        case 'validate_action':
            return { is_safe: true, risk_level: 'low', requires_approval: false };

        case 'get_audit_log':
            return { entries: [], total: 0 };

        case 'get_system_info':
            return {
                os: 'Windows 11',
                kernel_version: '10.0.22621',
                uptime: 12500, // seconds
                cpu_count: 12,
                total_memory: 32000000000,
                used_memory: 16000000000
            };

        case 'get_platform_info':
            return { platform: 'win32', version: '10.0.0' };

        case 'get_model_stats':
            return {
                default_model: 'llama3.2',
                llm_routing_enabled: true,
                active_models: ['llama3.2'],
                installed_models: ['llama3.2', 'mistral', 'codellama'],
                request_count: 42,
                profiles: {
                    routing: { model: 'llama3.2', speed: 8, capability: 7, purpose: 'General routing' },
                    fast: { model: 'llama3.2', speed: 9, capability: 6, purpose: 'Quick responses' },
                    capable: { model: 'mistral', speed: 6, capability: 9, purpose: 'Complex reasoning' },
                }
            };

        case 'send_to_kernel': {
            const msgStr = args?.message as string || '{}';
            const msgType = args?.messageType as string || '';
            try {
                const payload = JSON.parse(msgStr);
                if (msgType === 'manage_model') {
                    if (payload.action === 'list') {
                        return { success: true, data: { models: ['llama3.2', 'mistral', 'codellama', 'gemma2'], active: 'llama3.2' } };
                    }
                    if (payload.action === 'set') {
                        return { success: true, data: { model: payload.model, success: true } };
                    }
                    return { success: true, data: {} };
                }
                if (msgType === 'model_stats') {
                    return { success: true, data: { model: 'llama3.2', healthy: true } };
                }
                if (msgType === 'messaging') {
                    if (payload.action === 'list_channels') {
                        return {
                            success: true,
                            data: {
                                channels: [
                                    { type: 'whatsapp', enabled: true, connected: true, display_name: 'WhatsApp', message_count: 5 },
                                    { type: 'telegram', enabled: true, connected: false, display_name: 'Telegram', message_count: 0 },
                                    { type: 'discord', enabled: false, connected: false, display_name: 'Discord', message_count: 0 }
                                ],
                                stats: { total_messages: 5, active_channels: 2 }
                            }
                        };
                    }
                    if (payload.action === 'history') {
                        return { success: true, data: { messages: [] } };
                    }
                    return { success: true, data: { success: true } };
                }
            } catch (e) { /* fall through */ }
            return { success: true, data: { response: 'Mock kernel response' } };
        }

        default:
            console.warn(`[Browser Mock] Unknown command: ${cmd}`);
            return { success: false, error: `Unknown command: ${cmd}` };
    }
}

// Kernel API
export const kernelApi = {
    start: async (): Promise<KernelResponse> => (await getInvoke())('start_kernel'),

    stop: async (): Promise<KernelResponse> => (await getInvoke())('stop_kernel'),

    getStatus: async (): Promise<KernelStatus> => (await getInvoke())('get_kernel_status'),

    executeShell: async (command: string, cwd?: string): Promise<string> => (await getInvoke())('execute_shell', { command, cwd }),

    send: async (message: string, messageType: string = 'query'): Promise<KernelResponse> =>
        (await getInvoke())('send_to_kernel', { message, messageType }),

    getModelStats: async (): Promise<ModelStats> => {
        return await (await getInvoke())<ModelStats>('get_model_stats');
    },

    manageModel: async (action: 'pull' | 'delete', model: string): Promise<KernelResponse> => {
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action, model }),
            messageType: 'manage_model'
        });
    },

    listModels: async (): Promise<string[]> => {
        const response = await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'list' }),
            messageType: 'manage_model'
        });
        return response.success && response.data ? response.data.models : [];
    },

    setModel: async (model: string): Promise<boolean> => {
        const response = await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'set', model }),
            messageType: 'manage_model'
        });
        return response.success;
    },
};

// Memory API (Routed to Python Kernel via event bridge)
export const memoryApi = {
    query: async (query: string, tier?: string, limit?: number, domain?: string, category?: string): Promise<MemoryQueryResult> => {
        if (isTauri) {
            try {
                const response = await kernelBridge.sendAndWait(
                    JSON.stringify({ query, tier, limit, domain, category }),
                    'query_memory',
                    15000
                );
                if (response && response.data?.results) {
                    return {
                        success: true,
                        tier: tier || 'all',
                        results: response.data.results || [],
                        total_count: response.data.total_count || response.data.results.length
                    };
                }
                if (response?.timed_out) {
                    return { success: false, tier: tier || 'all', results: [], total_count: 0 };
                }
            } catch (e) {
                console.error('Memory query failed:', e);
            }
        }
        // Fallback (browser mock or error)
        const invoke = await getInvoke();
        const response = await invoke<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ query, tier, limit, domain, category }),
            messageType: 'query_memory'
        });
        return {
            success: response.success,
            tier: tier || 'all',
            results: response.data?.results || [],
            total_count: response.data?.total_count || 0
        };
    },

    store: async (content: string, tier: string, metadata?: Record<string, any>): Promise<MemoryStoreResult> => {
        if (isTauri) {
            try {
                const response = await kernelBridge.sendAndWait(
                    JSON.stringify({ content, tier, metadata }),
                    'store_memory',
                    10000
                );
                return {
                    success: response?.success ?? true,
                    id: response?.data?.id || `mem_${Date.now()}`,
                    tier: tier
                };
            } catch (e) {
                console.error('Memory store failed:', e);
            }
        }
        const invoke = await getInvoke();
        const response = await invoke<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ content, tier, metadata }),
            messageType: 'store_memory'
        });
        return { success: response.success, id: response.data?.id || `mem_${Date.now()}`, tier };
    },

    clearTier: async (tier: string): Promise<{ success: boolean; tier: string; cleared_count: number }> =>
        (await getInvoke())('clear_memory_tier', { tier }),

    delete: async (id: string): Promise<{ success: boolean }> => {
        if (isTauri) {
            try {
                const response = await kernelBridge.sendAndWait(
                    JSON.stringify({ id }),
                    'delete_memory',
                    10000
                );
                return { success: response?.success ?? true };
            } catch (e) { /* fall through */ }
        }
        return await (await getInvoke())<{ success: boolean }>('send_to_kernel', {
            message: JSON.stringify({ id }),
            messageType: 'delete_memory'
        });
    },

    indexFile: async (path: string): Promise<KernelResponse> => {
        if (isTauri) {
            try {
                const response = await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'index_file', path }),
                    'index_document',
                    30000
                );
                return response || { success: false, error: 'No response' };
            } catch (e) { /* fall through */ }
        }
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'index_file', path }),
            messageType: 'index_document'
        });
    },

    indexDir: async (path: string, recursive: boolean = true): Promise<KernelResponse> => {
        if (isTauri) {
            try {
                const response = await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'index_directory', path, recursive }),
                    'index_document',
                    60000
                );
                return response || { success: false, error: 'No response' };
            } catch (e) { /* fall through */ }
        }
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'index_directory', path, recursive }),
            messageType: 'index_document'
        });
    }
};

// Agent API (routes through kernel bridge for proper response correlation)
export const agentApi = {
    executeTask: async (description: string, autoApprove?: boolean): Promise<TaskExecuteResult> => {
        if (isTauri) {
            try {
                // Use the bridge to send a 'task' message and wait for the kernel response
                const response = await kernelBridge.sendAndWait(
                    JSON.stringify({ description, auto_approve: autoApprove ?? false }),
                    'task'
                    // Uses default 300s timeout from bridge TIMEOUTS
                );
                if (response && !response.timed_out) {
                    return {
                        success: response.success ?? true,
                        task_id: response.data?.task_id || response.id || `task_${Date.now()}`,
                        status: response.success ? 'completed' : 'failed',
                        message: response.data?.message || response.error || 'Task processed',
                    };
                }
                // Timed out — return as still running (kernel may still be processing)
                if (response?.timed_out) {
                    return {
                        success: true,
                        task_id: response.id || `task_${Date.now()}`,
                        status: 'running',
                        message: 'Task is still executing (long-running operation)',
                    };
                }
            } catch (e) {
                console.error('Agent executeTask bridge failed:', e);
            }
        }
        // Fallback: direct invoke (for browser mock or if bridge fails)
        return (await getInvoke())('execute_task', { description, auto_approve: autoApprove });
    },

    getTaskStatus: async (taskId: string): Promise<TaskStatusResult> => {
        // First try local Rust state for immediate status
        const localStatus = await (await getInvoke())<TaskStatusResult>('get_task_status', { task_id: taskId });
        return localStatus;
    },

    cancelTask: async (taskId: string): Promise<{ success: boolean; task_id: string; status: string }> =>
        (await getInvoke())('cancel_task', { task_id: taskId }),
};

// Safety API
export const safetyApi = {
    validateAction: async (action: string, details?: Record<string, any>): Promise<{ is_safe: boolean; risk_level: string; requires_approval: boolean }> =>
        (await getInvoke())('validate_action', { action, details }),

    getAuditLog: async (limit?: number, offset?: number): Promise<{ entries: AuditLogEntry[]; total: number }> =>
        (await getInvoke())('get_audit_log', { limit, offset }),

    requestApproval: async (action: string, details?: Record<string, any>): Promise<{ success: boolean }> =>
        (await getInvoke())('request_approval', { action, details }),

    resolveApproval: async (requestId: string, approved: boolean, reason?: string): Promise<{ success: boolean }> =>
        (await getInvoke())('resolve_approval', { requestId, approved, reason }),
};

// System API
export const systemApi = {
    getSystemInfo: async (): Promise<SystemInfo> => (await getInvoke())('get_system_info'),

    getStats: async (): Promise<any> => {
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({}),
            messageType: 'system_stats'
        });
    },

    updateConfig: async (config: Record<string, any>): Promise<KernelResponse> => {
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ config }),
            messageType: 'update_config'
        });
    },

    getPlatformInfo: async (): Promise<{ platform: string; version: string }> => (await getInvoke())('get_platform_info'),
};

// File System API (wrapper)
export const fsApi = {
    readDir: async (path: string): Promise<FileEntry[]> => {
        const fs = await getFs();
        if (fs) return fs.readDir(path);
        return [];
    },
    readTextFile: async (path: string): Promise<string> => {
        const fs = await getFs();
        if (fs) return fs.readTextFile(path);
        return "";
    },
    writeTextFile: async (path: string, contents: string): Promise<void> => {
        const fs = await getFs();
        if (fs && fs.writeTextFile) return fs.writeTextFile(path, contents);
    },
    createDir: async (path: string): Promise<void> => {
        const fs = await getFs();
        if (fs && fs.mkdir) return fs.mkdir(path, { recursive: true });
    },
    rename: async (oldPath: string, newPath: string): Promise<void> => {
        const fs = await getFs();
        if (fs && fs.rename) return fs.rename(oldPath, newPath);
    },
    remove: async (path: string): Promise<void> => {
        const fs = await getFs();
        if (fs && fs.remove) return fs.remove(path, { recursive: true });
    },
    convertFileSrc: (path: string) => convertFileSrcFn(path)
};

// Security API (Self-Destruct)
export const securityModApi = {
    getStatus: async (): Promise<KernelResponse> =>
        (await getInvoke())('send_to_kernel', { message: JSON.stringify({ action: 'destruct_status' }), messageType: 'security' }),

    initiate: async (level: string, pin: string, voicePrint?: string): Promise<KernelResponse> =>
        (await getInvoke())('send_to_kernel', { message: JSON.stringify({ action: 'initiate_destruct', data: { level, pin, voice_print: voicePrint } }), messageType: 'security' }),

    cancel: async (pin: string): Promise<KernelResponse> =>
        (await getInvoke())('send_to_kernel', { message: JSON.stringify({ action: 'cancel_destruct', data: { pin } }), messageType: 'security' }),
};

// Firewall API
export const firewallApi = {
    getRules: async (): Promise<KernelResponse> =>
        (await getInvoke())('send_to_kernel', { message: JSON.stringify({ action: 'list_rules' }), messageType: 'firewall' }),

    addRule: async (pattern: string, action: string, agentId?: string, description?: string): Promise<KernelResponse> =>
        (await getInvoke())('send_to_kernel', {
            message: JSON.stringify({ action: 'add_rule', data: { pattern, action, agent_id: agentId, description } }),
            messageType: 'firewall'
        }),

    deleteRule: async (id: string): Promise<KernelResponse> =>
        (await getInvoke())('send_to_kernel', { message: JSON.stringify({ action: 'delete_rule', data: { id } }), messageType: 'firewall' }),

    getLogs: async (limit: number = 50): Promise<KernelResponse> =>
        (await getInvoke())('send_to_kernel', { message: JSON.stringify({ action: 'logs', data: { limit } }), messageType: 'firewall' }),
};

// Intent API
export const intentApi = {
    dispatch: async (text: string, source: string = 'text'): Promise<KernelResponse> =>
        (await getInvoke())('send_to_kernel', { message: JSON.stringify({ text, source }), messageType: 'intent' }),

    // Full NLU pipeline: IntentParser → IntentDispatcher
    dispatchNLU: async (text: string): Promise<KernelResponse> =>
        (await getInvoke())('send_to_kernel', { message: JSON.stringify({ text }), messageType: 'intent_dispatch' }),
};

// Cron API (Kernel Scheduler via event bridge)
export const cronApi = {
    addJob: async (job: { id: string; title: string; schedule: string; action: string; agent: string; recurrence: string }): Promise<KernelResponse> => {
        if (isTauri) {
            try {
                const response = await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'add_job', ...job }),
                    'cron', 10000
                );
                return response || { success: true, message: 'Job added' };
            } catch (e) { /* fall through */ }
        }
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'add_job', ...job }),
            messageType: 'cron'
        });
    },

    removeJob: async (jobId: string): Promise<KernelResponse> => {
        if (isTauri) {
            try {
                const response = await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'remove_job', job_id: jobId }),
                    'cron', 10000
                );
                return response || { success: true, message: 'Job removed' };
            } catch (e) { /* fall through */ }
        }
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'remove_job', job_id: jobId }),
            messageType: 'cron'
        });
    },

    listJobs: async (): Promise<KernelResponse> => {
        if (isTauri) {
            try {
                const response = await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'list_jobs' }),
                    'cron', 10000
                );
                return response || { success: true, data: { jobs: [] } };
            } catch (e) { /* fall through */ }
        }
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'list_jobs' }),
            messageType: 'cron'
        });
    }
};

export const browserApi = {
    navigate: async (url: string): Promise<KernelResponse> => {
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'navigate', url }),
            messageType: 'browser'
        });
    },

    click: async (selector?: string, x?: number, y?: number): Promise<KernelResponse> => {
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'click', selector, x, y }),
            messageType: 'browser'
        });
    },

    type: async (text: string, selector?: string): Promise<KernelResponse> => {
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'type', text, selector }),
            messageType: 'browser'
        });
    },

    scroll: async (direction: 'up' | 'down', amount: number = 500): Promise<KernelResponse> => {
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'scroll', direction, amount }),
            messageType: 'browser'
        });
    },

    goBack: async (): Promise<KernelResponse> => {
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'go_back' }),
            messageType: 'browser'
        });
    },

    goForward: async (): Promise<KernelResponse> => {
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'go_forward' }),
            messageType: 'browser'
        });
    },

    reload: async (): Promise<KernelResponse> => {
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'reload' }),
            messageType: 'browser'
        });
    },

    getState: async (): Promise<KernelResponse> => {
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'get_state' }),
            messageType: 'browser'
        });
    }
};

export const messagingApi = {
    listChannels: async (): Promise<KernelResponse> => {
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'list_channels' }),
            messageType: 'messaging'
        });
    },

    send: async (channel: string, recipient: string, text: string): Promise<KernelResponse> => {
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'send', channel, recipient, text }),
            messageType: 'messaging'
        });
    },

    broadcast: async (text: string): Promise<KernelResponse> => {
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'broadcast', text }),
            messageType: 'messaging'
        });
    },

    getHistory: async (channel?: string, limit: number = 50): Promise<KernelResponse> => {
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'history', channel, limit }),
            messageType: 'messaging'
        });
    },

    toggleChannel: async (channel: string, enable: boolean): Promise<KernelResponse> => {
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'toggle_channel', channel, enable }),
            messageType: 'messaging'
        });
    }
};

// Deep Memory API (Tier 4 Knowledge Graph)
export const deepMemoryApi = {
    getStats: async (): Promise<any> => {
        if (isTauri) {
            try {
                return await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'stats' }), 'deep_memory', 10000
                );
            } catch (e) { /* fall through */ }
        }
        return { success: false, error: 'Not available in browser mode' };
    },

    search: async (query: string, entityType?: string, limit: number = 20): Promise<any> => {
        if (isTauri) {
            try {
                return await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'search', query, entity_type: entityType, limit }),
                    'deep_memory', 10000
                );
            } catch (e) { /* fall through */ }
        }
        return { success: false, data: { entities: [] } };
    },

    addEntity: async (name: string, entityType: string, properties?: Record<string, any>): Promise<any> => {
        if (isTauri) {
            try {
                return await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'add_entity', name, entity_type: entityType, properties }),
                    'deep_memory', 10000
                );
            } catch (e) { /* fall through */ }
        }
        return { success: false };
    },

    getNeighbors: async (entityId: string, maxHops: number = 2): Promise<any> => {
        if (isTauri) {
            try {
                return await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'neighbors', entity_id: entityId, max_hops: maxHops }),
                    'deep_memory', 10000
                );
            } catch (e) { /* fall through */ }
        }
        return { success: false, data: { neighbors: [] } };
    },

    getPreferences: async (): Promise<any> => {
        if (isTauri) {
            try {
                return await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'preferences' }), 'deep_memory', 10000
                );
            } catch (e) { /* fall through */ }
        }
        return { success: false, data: { preferences: [] } };
    },

    getPatterns: async (): Promise<any> => {
        if (isTauri) {
            try {
                return await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'patterns' }), 'deep_memory', 10000
                );
            } catch (e) { /* fall through */ }
        }
        return { success: false, data: { patterns: [] } };
    },

    extractFromConversation: async (conversation: string): Promise<any> => {
        if (isTauri) {
            try {
                return await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'extract', conversation }),
                    'deep_memory', 30000
                );
            } catch (e) { /* fall through */ }
        }
        return { success: false };
    },
};

// Document Indexer API (Tier 3 file ingestion)
export const documentApi = {
    indexFile: async (path: string): Promise<any> => {
        if (isTauri) {
            try {
                return await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'index_file', path }),
                    'index_document', 60000
                );
            } catch (e) { /* fall through */ }
        }
        return { success: false, error: 'Not available in browser mode' };
    },

    indexDirectory: async (path: string, recursive: boolean = true, extensions?: string[]): Promise<any> => {
        if (isTauri) {
            try {
                return await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'index_directory', path, recursive, extensions }),
                    'index_document', 300000 // 5 min timeout for large dirs
                );
            } catch (e) { /* fall through */ }
        }
        return { success: false, error: 'Not available in browser mode' };
    },

    listIndexed: async (): Promise<any> => {
        if (isTauri) {
            try {
                return await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'list_indexed' }),
                    'index_document', 10000
                );
            } catch (e) { /* fall through */ }
        }
        return { success: false, data: { documents: [] } };
    },

    deleteDocument: async (documentId: string): Promise<any> => {
        if (isTauri) {
            try {
                return await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'delete', document_id: documentId }),
                    'index_document', 10000
                );
            } catch (e) { /* fall through */ }
        }
        return { success: false };
    },
};

// Plugin API
export const pluginApi = {
    list: async (): Promise<KernelResponse> => {
        if (isTauri) {
            try {
                return await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'list' }),
                    'plugin', 10000
                ) || { success: true, data: { plugins: [] } };
            } catch (e) { /* fall through */ }
        }
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'list' }),
            messageType: 'plugin'
        });
    },

    enable: async (name: string): Promise<KernelResponse> => {
        if (isTauri) {
            try {
                return await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'enable', name }),
                    'plugin', 10000
                ) || { success: false };
            } catch (e) { /* fall through */ }
        }
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'enable', name }),
            messageType: 'plugin'
        });
    },

    disable: async (name: string): Promise<KernelResponse> => {
        if (isTauri) {
            try {
                return await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'disable', name }),
                    'plugin', 10000
                ) || { success: false };
            } catch (e) { /* fall through */ }
        }
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'disable', name }),
            messageType: 'plugin'
        });
    },

    reload: async (name: string): Promise<KernelResponse> => {
        if (isTauri) {
            try {
                return await kernelBridge.sendAndWait(
                    JSON.stringify({ action: 'reload', name }),
                    'plugin', 10000
                ) || { success: false };
            } catch (e) { /* fall through */ }
        }
        return await (await getInvoke())<KernelResponse>('send_to_kernel', {
            message: JSON.stringify({ action: 'reload', name }),
            messageType: 'plugin'
        });
    },
};

// Export all APIs
export default {
    kernel: kernelApi,
    memory: memoryApi,
    agent: agentApi,
    safety: safetyApi,
    system: systemApi,
    fs: fsApi,
    security: securityModApi,
    firewall: firewallApi,
    intent: intentApi,
    cron: cronApi,
    browser: browserApi,
    messaging: messagingApi,
    deepMemory: deepMemoryApi,
    document: documentApi,
    plugin: pluginApi,
};

