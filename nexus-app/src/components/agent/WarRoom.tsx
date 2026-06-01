
import React, { useEffect, useState, useRef } from "react";
import { Terminal, ShieldCheck, Database, Cpu, Activity, Send, Layers, Loader2, Box, Zap, Server, Globe, MessageSquare, Brain, Folder, Bot, Calendar, Settings, RotateCw, Trash2, Search, Package } from "lucide-react";
import { useStore } from "../../context/StoreContext";
import { Button } from "../ui/Button";
import { kernelApi, memoryApi, safetyApi, systemApi, agentApi, KernelStatus } from "../../services/tauriApi";
import { kernelBridge } from "../../services/kernelEventBridge";
import { OrchestrationCanvas } from "./OrchestrationCanvas";
import { AgentMonitor } from "./AgentMonitor";

interface AuditEntry {
    id: string;
    timestamp: string;
    action: string;
    risk_level: string;
    approved: boolean;
}

// New Component: Real-time Network Graph
// Real-time Network Graph connected to system stats
const NetworkGraph = ({ traffic }: { traffic: number }) => {
    // Keep last 30 data points
    const [points, setPoints] = useState<number[]>(new Array(30).fill(0));

    useEffect(() => {
        setPoints(prev => {
            const newPoints = [...prev, traffic];
            if (newPoints.length > 30) newPoints.shift();
            return newPoints;
        });
    }, [traffic]);

    // Normalize points to 0-100 range for SVG
    const max = Math.max(...points, 100); // dynamic scale, min 100kb/s baseline
    const path = points.map((p, i) => {
        const x = (i / 29) * 100;
        const normalized = (p / max) * 80; // Keep some headroom
        const y = 100 - normalized;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    return (
        <div className="w-full h-full relative overflow-hidden bg-background/50 rounded-lg border border-primary/10">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                <path d={`${path} L 100 100 L 0 100 Z`} fill="hsl(var(--primary) / 0.1)" stroke="none" />
            </svg>
            <div className="absolute top-2 left-2 text-[9px] text-primary/70 font-mono">
                NET_IO: {(traffic / 1024).toFixed(1)} KB/s
            </div>
        </div>
    );
};

// Apps that can be launched directly from Mission Control.
const LAUNCH_APPS: { id: string; icon: any; label: string }[] = [
    { id: 'echoes', icon: MessageSquare, label: 'Chat' },
    { id: 'memory', icon: Brain, label: 'Memory' },
    { id: 'terminal', icon: Terminal, label: 'Terminal' },
    { id: 'browser', icon: Globe, label: 'Browser' },
    { id: 'files', icon: Folder, label: 'Files' },
    { id: 'agents', icon: Bot, label: 'Agents' },
    { id: 'schedule', icon: Calendar, label: 'Scheduler' },
    { id: 'modules', icon: Package, label: 'Models' },
    { id: 'settings', icon: Settings, label: 'Settings' },
];

export function WarRoom() {
    const { thoughtStream, addThought, updateAgentStatus, swarm, openWindow } = useStore();
    const [logs, setLogs] = useState<string[]>([]);
    const [ebpfLogs, setEbpfLogs] = useState<string[]>([]);
    const [delegationInput, setDelegationInput] = useState("");
    const [taskRunning, setTaskRunning] = useState(false);
    const [latency, setLatency] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<'ops' | 'sys' | 'agents'>('ops');

    // Real data states
    const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
    const [systemMetrics, setSystemMetrics] = useState<{ cpu: number; memory: number; uptime: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [kernelStatus, setKernelStatus] = useState<'stopped' | 'running' | 'error'>('stopped');
    const [kernelInfo, setKernelInfo] = useState<KernelStatus | null>(null);
    const [currentTraffic, setCurrentTraffic] = useState(0);
    const lastNetStats = useRef<{ sent: number, recv: number } | null>(null);
    const [activeComponents, setActiveComponents] = useState<string[]>([]);

    const pulseComponent = (id: string) => {
        setActiveComponents(prev => {
            if (prev.includes(id)) return prev;
            return [...prev, id];
        });
        setTimeout(() => {
            setActiveComponents(prev => prev.filter(c => c !== id));
        }, 800);
    };

    // Fetch real data from backend
    useEffect(() => {
        const fetchRealData = async () => {
            try {
                // Fetch kernel status - handle potential failure
                try {
                    const status = await kernelApi.getStatus();
                    if (status) {
                        setKernelStatus(status.status as any);
                        setKernelInfo(status);
                    }
                } catch (e) {
                    console.warn("Status fetch failed", e);
                }

                // Fetch audit log
                try {
                    const auditResult = await safetyApi.getAuditLog(10, 0);
                    if (auditResult && Array.isArray(auditResult.entries)) {
                        setAuditEntries(auditResult.entries);
                    }
                } catch (e) { }

                // Fetch system stats (and time the round-trip for real latency)
                try {
                    const t0 = performance.now();
                    const statsResponse = await systemApi.getStats();
                    setLatency(Math.round(performance.now() - t0));
                    if (statsResponse?.success && statsResponse.data) {
                        const stats = statsResponse.data;

                        // Calculate network traffic (bandwidth)
                        if (stats.network) {
                            const nowTotal = (stats.network.bytes_sent || 0) + (stats.network.bytes_recv || 0);
                            if (lastNetStats.current) {
                                const prevTotal = lastNetStats.current.sent + lastNetStats.current.recv;
                                const diff = nowTotal - prevTotal;
                                // Assuming ~2s interval (rough estimate)
                                setCurrentTraffic(Math.max(0, diff / 2));
                            }
                            lastNetStats.current = { sent: stats.network.bytes_sent, recv: stats.network.bytes_recv };
                        }

                        setSystemMetrics({
                            cpu: stats.cpu?.percent || 0,
                            memory: stats.memory?.percent || 0,
                            uptime: stats.uptime || 0
                        });
                    }
                } catch (e) { }
            } catch (error) {
                console.error("Failed to fetch War Room data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchRealData();
        fetchRealData();
        const interval = setInterval(fetchRealData, 2000); // Refresh every 2s for live graphs
        return () => clearInterval(interval);
    }, []);

    // Real-time log stream from kernel events + heartbeat fallback
    useEffect(() => {
        // Subscribe to real kernel events for live activity
        const unsubResponse = kernelBridge.onMessageType('response', (data) => {
            const ts = new Date().toISOString().split('T')[1].slice(0, -1);
            const msg = data?.data?.response || data?.data?.message || data?.message_type || 'kernel response';

            // Pulse components based on message type
            if (data.message_type === 'query_memory') pulseComponent('memory');
            else if (data.message_type === 'browser') pulseComponent('browser');
            else if (data.message_type === 'voice') pulseComponent('voice');
            else if (data.message_type === 'security') pulseComponent('security');
            else pulseComponent('kernel');

            setLogs(prev => [`[${ts}] KERNEL: ${msg.substring(0, 80)}`, ...prev].slice(0, 20));
            // Also feed "low level" logs if in sys tab
            setEbpfLogs(prev => [`[${ts}] IPC: ${data.message_type} -> ${data.success ? 'OK' : 'ERR'}`, ...prev].slice(0, 20));
        });

        const unsubTask = kernelBridge.onMessageType('task_result', (data) => {
            const ts = new Date().toISOString().split('T')[1].slice(0, -1);
            const agent = data?.data?.agent_id || 'AGENT';
            const msg = data?.data?.message || 'Task completed';

            pulseComponent('brain'); // Agents use brain
            setLogs(prev => [`[${ts}] ${agent.toUpperCase()}: ${msg.substring(0, 80)}`, ...prev].slice(0, 20));
        });

        const unsubChunk = kernelBridge.onMessageType('chunk', (data) => {
            const ts = new Date().toISOString().split('T')[1].slice(0, -1);
            const content = data?.data?.content?.substring(0, 60) || '...';

            pulseComponent('brain');
            setActiveComponents(prev => prev.includes('brain') ? prev : [...prev, 'brain']); // Keep brain lit during streaming

            setLogs(prev => [`[${ts}] STREAM: ${content}`, ...prev].slice(0, 20));
        });

        // Real agentic progress: Thought / Action / Observation from the manager
        const unsubTao = kernelBridge.onMessageType('tao_event', (data) => {
            const ts = new Date().toISOString().split('T')[1].slice(0, -1);
            const d = data?.data || {};
            const kind = (d.type || 'THOUGHT').toUpperCase();
            const content = String(d.content || '').substring(0, 80);
            const glyph = kind === 'ACTION' ? '🔧' : kind === 'OBSERVATION' ? '👁' : '🧠';
            pulseComponent(kind === 'ACTION' ? 'toolbox' : 'brain');
            setLogs(prev => [`[${ts}] ${glyph} ${kind}: ${content}`, ...prev].slice(0, 20));
        });

        // Heartbeat fallback when no real events arrive
        const heartbeatInterval = setInterval(() => {
            const activeAgents = Array.isArray(swarm) ? swarm.filter(a => a.status !== 'idle') : [];
            if (activeAgents.length > 0) {
                const agent = activeAgents[0];
                if (agent?.name) {
                    const ts = new Date().toISOString().split('T')[1].slice(0, -1);
                    setLogs(prev => {
                        if (prev.length > 0 && prev[0].includes('HEARTBEAT')) return prev; // Don't spam heartbeats
                        return [`[${ts}] ${agent.name.toUpperCase()}: ${agent.currentTask || 'Processing...'}`, ...prev].slice(0, 20);
                    });
                }
            }
        }, 2000);

        return () => {
            unsubResponse();
            unsubTask();
            unsubChunk();
            unsubTao();
            clearInterval(heartbeatInterval);
        };
    }, [swarm, kernelStatus]);

    const handleDelegate = async () => {
        const task = delegationInput.trim();
        if (!task || taskRunning) return;

        const ts = () => new Date().toISOString().split('T')[1].slice(0, -1);
        setLogs(prev => [`[${ts()}] ⚙ DISPATCH: ${task.substring(0, 80)}`, ...prev].slice(0, 20));
        addThought({
            id: Date.now().toString(),
            timestamp: new Date(),
            type: 'action',
            component: 'supervisor',
            content: `Dispatched agentic task: "${task}"`,
        });
        setDelegationInput("");
        setTaskRunning(true);
        pulseComponent('brain');

        try {
            // Real agentic execution — plan + run tools. Progress streams into the
            // activity log via the 'tao_event' / 'task_result' subscriptions above.
            const result = await agentApi.executeTask(task, false);
            const ok = (result as any)?.success ?? true;
            setLogs(prev => [`[${ts()}] ${ok ? '✅' : '⚠️'} TASK ${ok ? 'COMPLETE' : 'FINISHED WITH ISSUES'}`, ...prev].slice(0, 20));
        } catch (e: any) {
            setLogs(prev => [`[${ts()}] ❌ TASK FAILED: ${e?.message || e}`, ...prev].slice(0, 20));
        } finally {
            setTaskRunning(false);
        }
    };

    const logLine = (msg: string) => {
        const ts = new Date().toISOString().split('T')[1].slice(0, -1);
        setLogs(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 20));
    };

    const handleRunAudit = async () => {
        logLine('🔒 Running security audit…');
        try {
            const res = await kernelBridge.sendAndWait(JSON.stringify({ action: 'run_audit' }), 'security', 15000);
            const findings = res?.data?.findings || [];
            setAuditEntries(findings.map((f: any, i: number) => ({
                id: f.id || `audit_${i}`,
                timestamp: f.timestamp || '',
                action: f.title || f.action || 'Finding',
                risk_level: f.severity || 'info',
                approved: f.resolved ?? true,
            })));
            logLine(`🔒 Audit complete · ${findings.length} findings`);
        } catch (e: any) {
            logLine(`❌ Audit failed: ${e?.message || e}`);
        }
    };

    const handleRestartKernel = async () => {
        logLine('♻ Restarting kernel…');
        try {
            if (kernelStatus === 'running') { await kernelApi.stop(); await new Promise(r => setTimeout(r, 600)); }
            await kernelApi.start();
            logLine('♻ Kernel restart requested');
        } catch (e: any) { logLine(`❌ Restart failed: ${e?.message || e}`); }
    };

    const handleClearMemory = async () => {
        try { await memoryApi.clearTier('session'); logLine('🧹 Session memory cleared'); }
        catch (e: any) { logLine(`❌ Clear failed: ${e?.message || e}`); }
    };

    const formatUptime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${mins}m`;
    };

    return (
        <div className="h-full flex flex-col font-mono text-xs text-foreground bg-background/80 backdrop-blur-3xl">
            {/* Top Navigation */}
            <div className="flex items-center gap-1 p-2 bg-muted/20 border-b border-border backdrop-blur-sm">
                <button onClick={() => setActiveTab('ops')} className={`px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all ${activeTab === 'ops' ? 'bg-primary/10 text-primary font-bold ring-1 ring-primary/20' : 'text-muted-foreground hover:bg-white/5'}`}>
                    <Terminal className="w-3.5 h-3.5" /> Operations
                </button>
                <button onClick={() => setActiveTab('sys')} className={`px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all ${activeTab === 'sys' ? 'bg-orange-500/10 text-orange-500 font-bold ring-1 ring-orange-500/20' : 'text-muted-foreground hover:bg-white/5'}`}>
                    <Cpu className="w-3.5 h-3.5" /> Hardware & Kernel
                </button>
                <button onClick={() => setActiveTab('agents')} className={`px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all ${activeTab === 'agents' ? 'bg-purple-500/10 text-purple-500 font-bold ring-1 ring-purple-500/20' : 'text-muted-foreground hover:bg-white/5'}`}>
                    <Layers className="w-3.5 h-3.5" /> Agents
                </button>
                <div className="ml-auto flex items-center gap-3">
                    {systemMetrics && (
                        <>
                            <span className="text-[10px] text-muted-foreground" title="CPU usage">
                                CPU <span className={systemMetrics.cpu > 85 ? 'text-red-400' : 'text-primary'}>{systemMetrics.cpu.toFixed(0)}%</span>
                            </span>
                            <span className="text-[10px] text-muted-foreground" title="Memory usage">
                                RAM <span className={systemMetrics.memory > 85 ? 'text-red-400' : 'text-primary'}>{systemMetrics.memory.toFixed(0)}%</span>
                            </span>
                        </>
                    )}
                    <span className="text-[10px] text-muted-foreground" title="Kernel round-trip latency">
                        PING <span className="text-primary">{latency != null ? `${latency}ms` : '—'}</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground">UP {systemMetrics ? formatUptime(systemMetrics.uptime) : '—'}</span>
                    <div className={`w-1.5 h-1.5 rounded-full ${kernelStatus === 'running' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} title={`Kernel: ${kernelStatus}`} />
                    {kernelStatus !== 'running' && <span className="text-[10px] text-red-500 font-bold px-2">OFFLINE</span>}
                </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
            {activeTab === 'ops' && (
                <div className="px-4 pt-3 flex flex-col gap-2">
                    {/* COMMAND BAR + SYSTEM ACTIONS */}
                    <div className="flex gap-2 items-stretch">
                        <div className="flex-1 flex items-center gap-2 bg-black/40 border border-primary/30 rounded-lg px-3">
                            <Send className="w-3.5 h-3.5 text-primary/60" />
                            <input
                                value={delegationInput}
                                onChange={e => setDelegationInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleDelegate(); }}
                                disabled={taskRunning}
                                className="flex-1 bg-transparent py-2 text-[11px] focus:outline-none text-primary placeholder:text-muted-foreground/60 disabled:opacity-50"
                                placeholder={taskRunning ? 'Running agentic task…' : 'Dispatch an agentic task to AETHER…  (e.g. "summarize the largest files in this folder")'}
                            />
                            <button onClick={handleDelegate} disabled={taskRunning} className="p-1.5 bg-primary/20 text-primary rounded hover:bg-primary/40 disabled:opacity-50">
                                {taskRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            </button>
                        </div>
                        <button onClick={handleRunAudit} title="Run security audit" className="px-3 rounded-lg bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 text-[10px] font-bold flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Audit</button>
                        <button onClick={handleClearMemory} title="Clear session memory" className="px-3 rounded-lg bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 text-[10px] font-bold flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Clear</button>
                        <button onClick={handleRestartKernel} title="Restart kernel" className="px-3 rounded-lg bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 text-[10px] font-bold flex items-center gap-1.5"><RotateCw className="w-3.5 h-3.5" /> Restart</button>
                        <button onClick={async () => { try { kernelStatus === 'running' ? await kernelApi.stop() : await kernelApi.start(); } catch (e) { console.error(e); } }} className={`px-3 rounded-lg text-[10px] font-bold flex items-center gap-1.5 ${kernelStatus === 'running' ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25' : 'bg-green-500/15 text-green-300 hover:bg-green-500/25'}`}>{kernelStatus === 'running' ? 'Stop' : 'Start'}</button>
                    </div>
                    {/* APP LAUNCHER */}
                    <div className="flex gap-1.5 flex-wrap items-center">
                        <span className="text-[9px] text-muted-foreground/60 font-bold mr-1">LAUNCH</span>
                        {LAUNCH_APPS.map(app => (
                            <button key={app.id} onClick={() => openWindow(app.id)} title={app.label}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 hover:bg-primary/15 text-[10px] text-zinc-300 hover:text-primary border border-white/5 transition-all">
                                <app.icon className="w-3 h-3" /> {app.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <div className="flex-1 p-4 grid grid-cols-2 grid-rows-[2fr_1fr] gap-4 overflow-hidden">
                {activeTab === 'ops' ? (
                    <>
                        {/* LEFT COL: Terminal Logs */}
                        <div className="glass-panel bg-black/60 border border-white/5 rounded-xl overflow-hidden flex flex-col relative group col-span-1 row-span-1 shadow-inner">
                            <div className="bg-white/5 p-2 flex items-center justify-between border-b border-white/5">
                                <span className="text-[10px] font-bold text-primary tracking-widest flex items-center gap-2"><Activity className="w-3 h-3" /> LIVE ACTIVITY LOG</span>
                            </div>
                            <div className="flex-1 p-3 overflow-hidden font-mono text-[10px] space-y-1">
                                {logs.map((log, i) => (
                                    <div key={i} className="text-zinc-400 border-l-2 border-transparent hover:border-primary pl-2 transition-all truncate">
                                        <span className="text-primary/50 mr-2">{'>'}</span>{log}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* RIGHT COL: Map & Stats */}
                        <div className="col-span-1 row-span-2 flex flex-col gap-4">
                            {/* Neural Map */}
                            <div className="flex-1 glass-panel bg-black/80 border border-white/5 rounded-xl overflow-hidden relative flex flex-col">
                                <div className="absolute top-3 left-3 z-10 text-[10px] font-bold text-purple-400 tracking-widest flex items-center gap-2">
                                    <Database className="w-3 h-3" /> SYSTEM ARCHITECTURE
                                </div>
                                <OrchestrationCanvas activeComponents={activeComponents} />
                                <div className="absolute bottom-3 right-3 z-10 flex flex-col items-end gap-1 pointer-events-none">
                                    <div className="text-[9px] text-zinc-500">AGENTS: {Array.isArray(swarm) ? swarm.length : 0}</div>
                                    <div className="text-[9px] text-zinc-500">LATENCY: {latency != null ? `${latency}ms` : '—'}</div>
                                </div>
                            </div>

                            {/* Network Graph */}
                            <div className="h-32 glass-panel bg-black/60 border border-white/5 rounded-xl block p-2">
                                <NetworkGraph traffic={currentTraffic} />
                            </div>
                        </div>

                        {/* BOTTOM LEFT: Security Audit feed */}
                        <div className="col-span-1 row-span-1 bg-orange-500/5 border border-orange-500/10 rounded-xl p-3 overflow-hidden flex flex-col">
                            <div className="flex items-center justify-between mb-1">
                                <div className="text-[9px] text-orange-500/70 font-bold flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> SECURITY AUDIT</div>
                                <button onClick={handleRunAudit} className="text-[9px] text-orange-300 hover:text-orange-200 flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/10 hover:bg-orange-500/20">
                                    <Search className="w-2.5 h-2.5" /> Run
                                </button>
                            </div>
                            <div className="space-y-1 overflow-y-auto custom-scrollbar flex-1">
                                {auditEntries.length === 0 && (
                                    <div className="text-[9px] text-muted-foreground/60 pt-2">No findings yet — press <span className="text-orange-300">Run</span> to scan the supervisor log & security posture.</div>
                                )}
                                {auditEntries.map((a, i) => {
                                    const risk = (a.risk_level || 'info').toLowerCase();
                                    const color = risk === 'critical' || risk === 'high' ? 'text-red-400 bg-red-500/10'
                                        : risk === 'medium' ? 'text-yellow-400 bg-yellow-500/10'
                                        : 'text-zinc-400 bg-white/5';
                                    return (
                                        <div key={a.id || i} className="flex items-center gap-1.5 text-[9px]">
                                            <span className={`px-1 rounded ${color} font-bold uppercase`}>{risk}</span>
                                            <span className="text-zinc-400 truncate flex-1">{a.action}</span>
                                            <span className={a.approved ? 'text-green-500' : 'text-red-500'}>{a.approved ? '✓' : '⛔'}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                ) : (
                    /* SYS TAB Content */
                    <>
                        <div className="col-span-2 row-span-1 glass-panel bg-black/80 border border-cyan-500/20 rounded-xl p-4 overflow-hidden relative group">
                            <div className="absolute top-0 right-0 p-2 text-cyan-500/50 text-[10px] font-mono border-b border-l border-cyan-500/20 rounded-bl-xl bg-cyan-950/20">IPC_EVENT_BUS</div>
                            <div className="text-cyan-400 font-bold mb-4 flex items-center gap-2"><Activity className="w-4 h-4" /> KERNEL EVENT STREAM</div>
                            <div className="font-mono text-[10px] text-cyan-400/80 space-y-1 overflow-hidden h-32 hover:overflow-y-auto custom-scrollbar">
                                {ebpfLogs.length === 0 && <div className="text-muted-foreground/50">Idle — kernel events will appear here.</div>}
                                {ebpfLogs.map((l, i) => <div key={i}>{l}</div>)}
                            </div>
                        </div>

                        {/* Kernel Modules Grid (clickable → relevant manager) */}
                        <div className="col-span-2 row-span-1 grid grid-cols-4 gap-3">
                            <button onClick={() => openWindow('settings')} className="glass-panel bg-cyan-950/20 border border-cyan-500/30 rounded-xl p-3 flex flex-col items-center justify-center text-center hover:ring-1 hover:ring-cyan-400/50 transition-all">
                                <Zap className={`w-5 h-5 mb-2 ${kernelInfo?.npu_available ? 'text-cyan-400' : 'text-zinc-600'}`} />
                                <div className="text-[10px] font-bold text-cyan-100">NPU ACCELERATOR</div>
                                <div className="text-[9px] text-cyan-500/70">{kernelInfo?.npu_available ? (kernelInfo.npu_backend || 'CUDA') : 'N/A'}</div>
                                <div className="text-[8px] text-cyan-400/50 mt-1">Configure ›</div>
                            </button>

                            <button onClick={() => openWindow('plugins')} className="glass-panel bg-yellow-950/20 border border-yellow-500/30 rounded-xl p-3 flex flex-col items-center justify-center text-center hover:ring-1 hover:ring-yellow-400/50 transition-all">
                                <Box className={`w-5 h-5 mb-2 ${kernelInfo?.skills_loaded ? 'text-yellow-400' : 'text-zinc-600'}`} />
                                <div className="text-[10px] font-bold text-yellow-100">SKILLS / PLUGINS</div>
                                <div className="text-[9px] text-yellow-500/70">{kernelInfo?.skills_loaded || 0} Modules</div>
                                <div className="text-[8px] text-yellow-400/50 mt-1">Manage ›</div>
                            </button>

                            <button onClick={() => openWindow('settings')} className="glass-panel bg-purple-950/20 border border-purple-500/30 rounded-xl p-3 flex flex-col items-center justify-center text-center hover:ring-1 hover:ring-purple-400/50 transition-all">
                                <Server className={`w-5 h-5 mb-2 ${kernelInfo?.sandbox_available ? 'text-purple-400' : 'text-zinc-600'}`} />
                                <div className="text-[10px] font-bold text-purple-100">DOCKER SANDBOX</div>
                                <div className="text-[9px] text-purple-500/70">{kernelInfo?.sandbox_available ? 'ONLINE' : 'OFFLINE'}</div>
                                <div className="text-[8px] text-purple-400/50 mt-1">{kernelInfo?.sandbox_available ? 'Ready' : 'Needs Docker ›'}</div>
                            </button>

                            <button onClick={() => openWindow('messaging')} className="glass-panel bg-green-950/20 border border-green-500/30 rounded-xl p-3 flex flex-col items-center justify-center text-center hover:ring-1 hover:ring-green-400/50 transition-all">
                                <Globe className={`w-5 h-5 mb-2 ${kernelInfo?.openclaw_connected ? 'text-green-400' : 'text-zinc-600'}`} />
                                <div className="text-[10px] font-bold text-green-100">OPENCLAW</div>
                                <div className="text-[9px] text-green-500/70">{kernelInfo?.openclaw_connected ? 'CONNECTED' : 'DISCONNECTED'}</div>
                                <div className="text-[8px] text-green-400/50 mt-1">Messaging ›</div>
                            </button>
                        </div>
                    </>
                )}
                {activeTab === 'agents' && (
                    <div className="col-span-2 row-span-2 glass-panel bg-zinc-900/50 border border-purple-500/20 rounded-xl overflow-hidden p-0">
                        <AgentMonitor />
                    </div>
                )}
            </div>
            </div>
        </div>
    );
}
