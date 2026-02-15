
import React, { useEffect, useState, useRef } from "react";
import { Terminal, ShieldCheck, Database, GitBranch, Cpu, Activity, Lock, AlertTriangle, Send, Layers, RefreshCw, Loader2, CheckCircle2, Box, Zap, Server, Globe } from "lucide-react";
import { useStore } from "../../context/StoreContext";
import { Button } from "../ui/Button";
import { kernelApi, memoryApi, safetyApi, systemApi, KernelStatus } from "../../services/tauriApi";
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

interface MemoryContext {
    id: string;
    content: string;
    score: number;
    tier: string;
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

// New Component: Neural Activity Map (Canvas)
const NeuralMap = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = canvas.width = canvas.parentElement?.clientWidth || 300;
        let height = canvas.height = canvas.parentElement?.clientHeight || 200;

        const particles: { x: number, y: number, vx: number, vy: number }[] = [];
        for (let i = 0; i < 40; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5
            });
        }

        const animate = () => {
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = '#09090b'; // bg-zinc-950
            ctx.fillRect(0, 0, width, height);

            ctx.strokeStyle = 'rgba(100, 255, 255, 0.1)';
            ctx.fillStyle = 'rgba(100, 255, 255, 0.5)';

            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;

                ctx.beginPath();
                ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
                ctx.fill();

                particles.forEach(p2 => {
                    const dx = p.x - p2.x;
                    const dy = p.y - p2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 50) {
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                    }
                });
            });
            requestAnimationFrame(animate);
        };
        const animId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animId);
    }, []);

    return <canvas ref={canvasRef} className="w-full h-full opacity-80" />;
}

export function WarRoom() {
    const { thoughtStream, addThought, updateAgentStatus, swarm } = useStore();
    const [logs, setLogs] = useState<string[]>([]);
    const [ebpfLogs, setEbpfLogs] = useState<string[]>([]);
    const [delegationInput, setDelegationInput] = useState("");
    const [npuLoad, setNpuLoad] = useState([20, 30, 45, 30, 50, 60, 40, 30, 20]);
    const [activeTab, setActiveTab] = useState<'ops' | 'sys' | 'agents'>('ops');

    // Real data states
    const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
    const [memoryContext, setMemoryContext] = useState<MemoryContext[]>([]);
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

                // Fetch memory context
                try {
                    const memoryResult = await memoryApi.query("", "all", 6);
                    if (memoryResult && memoryResult.success && Array.isArray(memoryResult.results)) {
                        setMemoryContext(memoryResult.results.map(r => ({
                            id: r.id,
                            content: r.content ? r.content.substring(0, 50) : '...',
                            score: r.score || 0,
                            tier: r.tier || 'unknown'
                        })));
                    }
                } catch (e) { }

                // Fetch system stats
                try {
                    const statsResponse = await systemApi.getStats();
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
            setEbpfLogs(prev => [`[${ts}] SYSCALL: ${data.message_type} -> ${data.success ? 'OK' : 'ERR'}`, ...prev].slice(0, 20));
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

            // NPU Load based on kernel status
            const baseLoad = kernelStatus === 'running' ? 40 : 15;
            setNpuLoad(prev => [...prev.slice(1), Math.floor(Math.random() * 30) + baseLoad]);
        }, 2000);

        return () => {
            unsubResponse();
            unsubTask();
            unsubChunk();
            clearInterval(heartbeatInterval);
        };
    }, [swarm, kernelStatus]);

    const handleDelegate = () => {
        if (!delegationInput.trim()) return;

        addThought({
            id: Date.now().toString(),
            timestamp: new Date(),
            type: 'action',
            component: 'supervisor',
            content: `DELEGATION COMMAND: Dispatched task "${delegationInput}" to DEV-ARCH agent.`
        });

        updateAgentStatus('dev-arch', {
            status: 'executing',
            currentTask: delegationInput,
            confidence: 100
        });

        setTimeout(() => {
            updateAgentStatus('dev-arch', {
                status: 'idle',
                currentTask: 'Awaiting new spec',
                confidence: 95
            });
        }, 4000);

        setDelegationInput("");
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
                <div className="ml-auto flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">UPTIME: {systemMetrics ? formatUptime(systemMetrics.uptime) : 'Checking...'}</span>
                    <div className={`w-1.5 h-1.5 rounded-full ${kernelStatus === 'running' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} title={`Kernel: ${kernelStatus}`} />
                    {kernelStatus !== 'running' && <span className="text-[10px] text-red-500 font-bold px-2">OFFLINE</span>}
                </div>
            </div>

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
                                    <div className="text-[9px] text-zinc-500">NODES_ACTIVE: {swarm.length + 6}</div>
                                    <div className="text-[9px] text-zinc-500">LATENCY: 12ms</div>
                                </div>
                            </div>

                            {/* Network Graph */}
                            <div className="h-32 glass-panel bg-black/60 border border-white/5 rounded-xl block p-2">
                                <NetworkGraph traffic={currentTraffic} />
                            </div>
                        </div>

                        {/* BOTTOM LEFT: Quick Actions & Memory */}
                        <div className="col-span-1 row-span-1 grid grid-cols-2 gap-2">
                            <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 flex flex-col">
                                <div className="text-[9px] text-primary/60 font-bold mb-2">QUICK ACTIONS</div>
                                <div className="flex flex-col gap-1.5 flex-1">
                                    <button
                                        onClick={async () => {
                                            try {
                                                if (kernelStatus === 'running') {
                                                    await kernelApi.stop();
                                                } else {
                                                    await kernelApi.start();
                                                }
                                            } catch (e) { console.error(e); }
                                        }}
                                        className={`flex-1 flex items-center justify-center gap-2 rounded text-[10px] font-bold transition-all ${kernelStatus === 'running' ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}
                                    >
                                        {kernelStatus === 'running' ? 'Stop Kernel' : 'Start Kernel'}
                                    </button>
                                    <button
                                        onClick={async () => {
                                            try { await memoryApi.clearTier('session'); } catch (e) { }
                                        }}
                                        className="flex-1 flex items-center justify-center gap-2 bg-orange-500/20 text-orange-400 rounded text-[10px] font-bold hover:bg-orange-500/30"
                                    >
                                        Clear Session
                                    </button>
                                </div>
                                <div className="flex gap-1 mt-2">
                                    <input value={delegationInput} onChange={e => setDelegationInput(e.target.value)} className="flex-1 bg-black/40 border border-primary/20 rounded px-2 text-[10px] focus:outline-none text-primary" placeholder="Cmd..." />
                                    <button onClick={handleDelegate} className="p-1 bg-primary/20 text-primary rounded hover:bg-primary/40"><Send className="w-3 h-3" /></button>
                                </div>
                            </div>
                            <div className="bg-purple-500/5 border border-purple-500/10 rounded-xl p-3 overflow-hidden">
                                <div className="text-[9px] text-purple-500/60 font-bold mb-1">MEMORY FRAGMENTS</div>
                                <div className="space-y-1">
                                    {memoryContext.slice(0, 3).map((m, i) => (
                                        <div key={i} className="h-1 w-full bg-purple-500/20 rounded-full overflow-hidden">
                                            <div className="h-full bg-purple-500" style={{ width: `${m.score * 100}%` }} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    /* SYS TAB Content */
                    <>
                        <div className="col-span-2 row-span-1 glass-panel bg-black/80 border border-red-500/20 rounded-xl p-4 overflow-hidden relative group">
                            <div className="absolute top-0 right-0 p-2 text-red-500/50 text-[10px] font-mono border-b border-l border-red-500/20 rounded-bl-xl bg-red-950/20">KERNEL_PANIC_HNDL_0x42</div>
                            <div className="text-red-400 font-bold mb-4 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> LOW LEVEL KERNEL STREAM</div>
                            <div className="font-mono text-[10px] text-red-400/80 space-y-1 overflow-hidden h-32 hover:overflow-y-auto custom-scrollbar">
                                {ebpfLogs.map((l, i) => <div key={i}>{l}</div>)}
                            </div>
                        </div>

                        {/* Kernel Modules Grid */}
                        <div className="col-span-2 row-span-1 grid grid-cols-4 gap-3">
                            <div className="glass-panel bg-cyan-950/20 border border-cyan-500/30 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                                <Zap className={`w-5 h-5 mb-2 ${kernelInfo?.npu_available ? 'text-cyan-400' : 'text-zinc-600'}`} />
                                <div className="text-[10px] font-bold text-cyan-100">NPU ACCELERATOR</div>
                                <div className="text-[9px] text-cyan-500/70">{kernelInfo?.npu_available ? (kernelInfo.npu_backend || 'CUDA') : 'N/A'}</div>
                            </div>

                            <div className="glass-panel bg-yellow-950/20 border border-yellow-500/30 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                                <Box className={`w-5 h-5 mb-2 ${kernelInfo?.skills_loaded ? 'text-yellow-400' : 'text-zinc-600'}`} />
                                <div className="text-[10px] font-bold text-yellow-100">SKILLS LOADED</div>
                                <div className="text-[9px] text-yellow-500/70">{kernelInfo?.skills_loaded || 0} Modules</div>
                            </div>

                            <div className="glass-panel bg-purple-950/20 border border-purple-500/30 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                                <Server className={`w-5 h-5 mb-2 ${kernelInfo?.sandbox_available ? 'text-purple-400' : 'text-zinc-600'}`} />
                                <div className="text-[10px] font-bold text-purple-100">DOCKER SANDBOX</div>
                                <div className="text-[9px] text-purple-500/70">{kernelInfo?.sandbox_available ? 'ONLINE' : 'OFFLINE'}</div>
                            </div>

                            <div className="glass-panel bg-green-950/20 border border-green-500/30 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                                <Globe className={`w-5 h-5 mb-2 ${kernelInfo?.openclaw_connected ? 'text-green-400' : 'text-zinc-600'}`} />
                                <div className="text-[10px] font-bold text-green-100">OPENCLAW</div>
                                <div className="text-[9px] text-green-500/70">{kernelInfo?.openclaw_connected ? 'CONNECTED' : 'DISCONNECTED'}</div>
                            </div>
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
    );
}
