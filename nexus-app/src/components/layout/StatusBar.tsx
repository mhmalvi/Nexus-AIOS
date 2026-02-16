
import React, { useState, useEffect, useRef } from "react";
import { Activity, Cpu, HardDrive, Brain, GitBranch, Wifi, Clock } from "lucide-react";
import { useStore } from "../../context/StoreContext";
import { kernelApi, systemApi } from "../../services/tauriApi";
import { mockTauri } from "../../services/mockTauri";
import { STATUS_BAR_HEIGHT } from "../../services/WindowBounds";

interface SystemTelemetry {
    cpuPercent: number;
    memPercent: number;
    memUsedGB: string;
    memTotalGB: string;
    diskFree: string;
    uptime: string;
    networkLatency: number;
}

function getDefaultTelemetry(): SystemTelemetry {
    return {
        cpuPercent: 0,
        memPercent: 0,
        memUsedGB: '0',
        memTotalGB: '0',
        diskFree: '—',
        uptime: '0m',
        networkLatency: 0,
    };
}

/** Format milliseconds into a readable uptime string */
function formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
}

/** Measure network latency via a small fetch to the current origin */
async function measureLatency(): Promise<number> {
    try {
        const start = performance.now();
        await fetch(window.location.origin, { method: 'HEAD', cache: 'no-store', mode: 'no-cors' });
        return Math.round(performance.now() - start);
    } catch {
        return 0;
    }
}

export function StatusBar() {
    const { agent, ui, openWindow } = useStore();
    const [telemetry, setTelemetry] = useState<SystemTelemetry>(getDefaultTelemetry);
    const [kernelStatus, setKernelStatus] = useState<'stopped' | 'starting' | 'running' | 'error'>('stopped');
    const [kernelPid, setKernelPid] = useState<number | null>(null);
    const [modelInfo, setModelInfo] = useState({ name: 'gemini-2.5-pro', type: 'Multi' });
    const [openClawConnected, setOpenClawConnected] = useState(false);
    const [voiceActive, setVoiceActive] = useState(false);
    const [npuActive, setNpuActive] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const startTimeRef = useRef(Date.now());
    const prevKernelRunning = useRef(false);
    const restartAttempted = useRef(false);

    // Real-time clock
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Real-time telemetry polling
    useEffect(() => {
        // Subscribe to kernel responses for system stats
        const unsub = mockTauri.subscribeResponse((msg) => {
            if (msg.message_type === 'system_stats' && msg.data) {
                setTelemetry(prev => ({
                    ...prev,
                    cpuPercent: msg.data.cpu?.percent ?? prev.cpuPercent,
                    memPercent: msg.data.memory?.percent ?? prev.memPercent,
                    memUsedGB: msg.data.memory?.used_gb?.toFixed(1) ?? prev.memUsedGB,
                    memTotalGB: msg.data.memory?.total_gb?.toFixed(1) ?? prev.memTotalGB,
                    diskFree: msg.data.disk?.partitions?.[0]?.free ?? prev.diskFree,
                }));
            }
        });

        const fetchTelemetry = async () => {
            try {
                // Kernel status
                const status = await kernelApi.getStatus();
                setKernelStatus(status.status as any);
                setKernelPid(status.process_id || null);
                setOpenClawConnected(!!status.openclaw_connected);
                setVoiceActive(!!status.voice_enabled);
                setNpuActive(!!status.npu_available);

                // Auto-restart: if kernel was previously running and crashed
                if (prevKernelRunning.current && (status.status === 'stopped' || status.status === 'error') && !restartAttempted.current) {
                    restartAttempted.current = true;
                    console.warn('Kernel crashed — attempting auto-restart...');
                    try { await kernelApi.start(); } catch (_) { }
                }
                if (status.status === 'running') {
                    prevKernelRunning.current = true;
                    restartAttempted.current = false;
                }

                if (status.status === 'running') {
                    // Request system stats from kernel
                    await systemApi.getStats();

                    // Model info
                    try {
                        const mStats = await kernelApi.getModelStats();
                        if (mStats?.default_model) {
                            setModelInfo({ name: mStats.default_model.split(':')[0], type: mStats.llm_routing_enabled ? 'Multi' : 'Single' });
                        }
                    } catch (_) { }
                }
            } catch (_) { }

            // Browser-available metrics (always available, doesn't require kernel)
            try {
                // Memory usage from browser Performance API
                const perf = (performance as any);
                if (perf.memory) {
                    const usedMB = perf.memory.usedJSHeapSize / (1024 * 1024);
                    const totalMB = perf.memory.jsHeapSizeLimit / (1024 * 1024);
                    setTelemetry(prev => ({
                        ...prev,
                        memPercent: prev.memPercent || Math.round((usedMB / totalMB) * 100),
                        memUsedGB: prev.memUsedGB !== '0' ? prev.memUsedGB : (usedMB / 1024).toFixed(1),
                        memTotalGB: prev.memTotalGB !== '0' ? prev.memTotalGB : (totalMB / 1024).toFixed(1),
                    }));
                }
            } catch (_) { }

            // Uptime
            setTelemetry(prev => ({
                ...prev,
                uptime: formatUptime(Date.now() - startTimeRef.current),
            }));

            // Network latency (every poll)
            const latency = await measureLatency();
            setTelemetry(prev => ({ ...prev, networkLatency: latency }));
        };

        fetchTelemetry();
        const interval = setInterval(fetchTelemetry, 3000); // Poll every 3 seconds
        return () => { clearInterval(interval); unsub(); };
    }, []);

    if (ui.focusMode) return null;

    const isProcessing = agent.isThinking || agent.isListening;
    const kernelRunning = kernelStatus === 'running';
    const pidDisplay = kernelPid || '—';

    const kernelStarting = kernelStatus === 'starting';
    const statusDot = isProcessing ? 'bg-green-500 animate-pulse' : kernelStarting ? 'bg-yellow-500 animate-pulse' : kernelRunning ? 'bg-blue-500' : 'bg-orange-400';
    const statusLabel = isProcessing ? 'ACTIVE' : kernelStarting ? 'STARTING' : kernelRunning ? 'KERNEL' : 'IDLE';

    // Color-code CPU based on load
    const cpuColor = telemetry.cpuPercent > 80 ? 'text-destructive' : telemetry.cpuPercent > 50 ? 'text-yellow-500' : 'text-muted-foreground';
    const memColor = telemetry.memPercent > 85 ? 'text-destructive' : telemetry.memPercent > 60 ? 'text-yellow-500' : 'text-muted-foreground';

    return (
        <div
            className="fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur-xl border-t border-border/50 flex items-center justify-between px-3 font-mono text-[10px] select-none z-[100] text-muted-foreground"
            style={{ height: STATUS_BAR_HEIGHT }}
        >
            {/* Left: Kernel Status + System Telemetry */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 cursor-pointer hover:text-foreground/60 transition-colors" onClick={() => openWindow('war-room')}>
                    <div className={`w-[5px] h-[5px] rounded-full ${statusDot}`} />
                    <span className="font-semibold tracking-wide text-foreground/70">{statusLabel}</span>
                    {kernelRunning && <span className="text-muted-foreground/60">PID:{pidDisplay}</span>}
                </div>

                <div className="w-px h-2.5 bg-border" />

                {/* Status Indicators */}
                <div className="flex gap-2">
                    <span title="OpenClaw" className={`font-bold ${openClawConnected ? 'text-blue-400' : 'text-muted-foreground/30'}`}>OC</span>
                    <span title="Voice Engine" className={`font-bold ${voiceActive ? 'text-green-400' : 'text-muted-foreground/30'}`}>VC</span>
                    <span title="Neural Processing Unit" className={`font-bold ${npuActive ? 'text-purple-400' : 'text-muted-foreground/30'}`}>NPU</span>
                </div>

                <div className="w-px h-2.5 bg-border" />

                {/* CPU — real-time with color coding */}
                <div className={`hidden sm:flex items-center gap-1 ${cpuColor}`}>
                    <Cpu className="w-3 h-3 opacity-60" />
                    <span>{telemetry.cpuPercent.toFixed(0)}%</span>
                </div>

                {/* Memory — real-time with color coding */}
                <div className={`hidden sm:flex items-center gap-1 ${memColor}`}>
                    <Activity className="w-3 h-3 opacity-60" />
                    <span>{telemetry.memPercent.toFixed(0)}%</span>
                    <span className="text-muted-foreground/40 hidden lg:inline">({telemetry.memUsedGB}/{telemetry.memTotalGB}GB)</span>
                </div>

                {/* Disk */}
                <div className="hidden md:flex items-center gap-1">
                    <HardDrive className="w-3 h-3 opacity-50" />
                    <span>{telemetry.diskFree}</span>
                </div>

                <div className="w-px h-2.5 bg-border hidden md:block" />

                {/* Network Latency */}
                <div className="hidden md:flex items-center gap-1">
                    <Wifi className="w-3 h-3 opacity-50" />
                    <span>{telemetry.networkLatency}ms</span>
                </div>

                {/* Uptime */}
                <div className="hidden lg:flex items-center gap-1">
                    <Clock className="w-3 h-3 opacity-50" />
                    <span>up {telemetry.uptime}</span>
                </div>
            </div>

            {/* Right: Model + Time + Version */}
            <div className="flex items-center gap-3">
                <div className="hidden md:flex items-center gap-1 cursor-pointer hover:text-foreground/60 transition-colors" onClick={() => openWindow('settings')}>
                    <Brain className="w-3 h-3 opacity-50" />
                    <span>{modelInfo.name}</span>
                </div>

                <div className="w-px h-2.5 bg-border" />

                <span className="text-foreground/60 font-medium tabular-nums">
                    {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                </span>

                <div className="w-px h-2.5 bg-border" />

                <div className="flex items-center gap-1">
                    <GitBranch className="w-3 h-3 opacity-40" />
                    <span className="text-muted-foreground/70">AETHER v3.2</span>
                </div>
            </div>
        </div>
    );
}
