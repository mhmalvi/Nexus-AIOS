
import React, { useEffect, useState } from "react";
import { Terminal, ShieldCheck, Database, GitBranch, Cpu, Activity, Lock, AlertTriangle, Send, Layers } from "lucide-react";
import { useStore } from "../../context/StoreContext";
import { Button } from "../ui/Button";

export function WarRoom() {
  const { thoughtStream, addThought, updateAgentStatus } = useStore();
  const [logs, setLogs] = useState<string[]>([]);
  const [ebpfLogs, setEbpfLogs] = useState<string[]>([]);
  const [delegationInput, setDelegationInput] = useState("");
  const [npuLoad, setNpuLoad] = useState([20, 30, 45, 30, 50, 60, 40, 30, 20]);
  const [activeTab, setActiveTab] = useState<'ops' | 'sys'>('ops');

  useEffect(() => {
    const interval = setInterval(() => {
      // General Ops Logs
      if (Math.random() > 0.7) {
        const newLog = `[${new Date().toISOString().split('T')[1].slice(0,-1)}] PROCESS_ID_${Math.floor(Math.random()*9000)+1000}: Executing batch operation...`;
        setLogs(prev => [newLog, ...prev].slice(0, 20));
      }
      
      // eBPF Kernel Logs
      if (Math.random() > 0.5) {
          const syscalls = ['sys_read', 'sys_write', 'tcp_connect', 'vfs_read', 'kprobe/tcp_v4_connect'];
          const newEbpf = `[KERNEL] ${syscalls[Math.floor(Math.random()*syscalls.length)]} -> pid:${Math.floor(Math.random()*30000)} comm:nexus_agent ret:0`;
          setEbpfLogs(prev => [newEbpf, ...prev].slice(0, 15));
      }

      // NPU Sim
      setNpuLoad(prev => [...prev.slice(1), Math.floor(Math.random() * 40) + 20]);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const handleDelegate = () => {
    if(!delegationInput.trim()) return;
    
    // 1. Add Thought
    addThought({
        id: Date.now().toString(),
        timestamp: new Date(),
        type: 'action',
        component: 'supervisor',
        content: `DELEGATION COMMAND: Dispatched task "${delegationInput}" to DEV-ARCH agent.`
    });

    // 2. Update Swarm State (Visual Feedback)
    updateAgentStatus('dev-arch', {
        status: 'executing',
        currentTask: delegationInput,
        confidence: 100
    });

    // 3. Reset after timeout
    setTimeout(() => {
        updateAgentStatus('dev-arch', {
            status: 'idle',
            currentTask: 'Awaiting new spec',
            confidence: 95
        });
    }, 4000);

    setDelegationInput("");
  };

  return (
    <div className="h-full flex flex-col font-mono text-xs">
      {/* Top Navigation for War Room Layers */}
      <div className="flex items-center gap-1 p-2 bg-muted/20 border-b border-border">
          <button 
             onClick={() => setActiveTab('ops')}
             className={`px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all ${activeTab === 'ops' ? 'bg-card shadow-sm text-primary font-bold' : 'text-muted-foreground hover:bg-card/50'}`}
          >
              <Terminal className="w-3.5 h-3.5" />
              Operations
          </button>
          <button 
             onClick={() => setActiveTab('sys')}
             className={`px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all ${activeTab === 'sys' ? 'bg-card shadow-sm text-nexus-alert font-bold' : 'text-muted-foreground hover:bg-card/50'}`}
          >
              <Cpu className="w-3.5 h-3.5" />
              Hardware & Kernel
          </button>
      </div>

      <div className="flex-1 p-4 grid grid-cols-2 grid-rows-[2fr_1fr] gap-4 overflow-hidden">
        
        {activeTab === 'ops' ? (
            <>
                {/* 1. Worker Agent (Terminal) */}
                <div className="glass-panel bg-card border border-border rounded-xl overflow-hidden flex flex-col relative group col-span-1 row-span-1 shadow-sm">
                    <div className="bg-muted/50 border-b border-border p-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-primary">
                            <Terminal className="w-4 h-4" />
                            <span className="font-bold tracking-wider text-foreground">WORKER AGENT</span>
                        </div>
                        <div className="flex gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-red-500/80 shadow-sm" />
                            <div className="w-2 h-2 rounded-full bg-yellow-500/80 shadow-sm" />
                            <div className="w-2 h-2 rounded-full bg-green-500 shadow-sm animate-pulse" />
                        </div>
                    </div>
                    <div className="flex-1 p-4 font-mono text-zinc-400 overflow-hidden relative bg-zinc-950">
                        <div className="space-y-1">
                            {logs.map((log, i) => (
                                <div key={i} className="opacity-80 hover:opacity-100 hover:text-zinc-200 transition-opacity">
                                    <span className="text-blue-500 mr-2">$</span>
                                    {log}
                                </div>
                            ))}
                            <div className="animate-pulse text-blue-500">_</div>
                        </div>
                    </div>
                </div>

                {/* 2. Supervisor & Audit */}
                <div className="flex flex-col gap-4 col-span-1 row-span-2">
                    <div className="glass-panel bg-card border border-border rounded-xl overflow-hidden flex flex-col flex-1 shadow-sm">
                        <div className="bg-muted/50 border-b border-border p-2 flex items-center justify-between text-nexus-alert">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-orange-500" />
                                <span className="font-bold tracking-wider text-foreground">SUPERVISOR / AUDIT</span>
                            </div>
                            <div className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 rounded text-[10px] text-orange-600 animate-pulse font-bold">LIVE</div>
                        </div>
                        <div className="flex-1 p-4 flex flex-col gap-2">
                            <div className="p-3 rounded bg-orange-500/5 border border-orange-500/20 flex items-center gap-3">
                                <Lock className="w-5 h-5 text-orange-500" />
                                <div>
                                    <div className="font-bold text-foreground">Safety Guardrails Active</div>
                                    <div className="text-muted-foreground">Monitoring tool execution params</div>
                                </div>
                            </div>
                            {/* Stats */}
                            <div className="mt-2 text-muted-foreground space-y-2">
                                <div className="flex items-center justify-between"><span>Permission Check</span><CheckMark /></div>
                                <div className="w-full h-px bg-border" />
                                <div className="flex items-center justify-between"><span>PII Redaction</span><CheckMark /></div>
                            </div>
                        </div>
                    </div>

                    <div className="glass-panel bg-card border border-border rounded-xl overflow-hidden flex flex-col h-[40%] shadow-sm">
                        <div className="bg-muted/50 border-b border-border p-2 flex items-center gap-2 text-foreground">
                            <Cpu className="w-4 h-4 text-primary" />
                            <span className="font-bold tracking-wider">DELEGATE</span>
                        </div>
                        <div className="p-4 flex gap-2 items-end h-full">
                            <input 
                                type="text" 
                                value={delegationInput}
                                onChange={(e) => setDelegationInput(e.target.value)}
                                placeholder="Task for DevArch..."
                                className="flex-1 bg-muted/30 border border-border rounded px-3 py-2 focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
                            />
                            <Button onClick={handleDelegate} size="icon" className="bg-primary hover:bg-primary/90 text-primary-foreground h-full w-10 rounded">
                                <Send className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* 3. Memory Context */}
                <div className="glass-panel bg-card border border-border rounded-xl overflow-hidden flex flex-col col-span-1 row-span-1 shadow-sm">
                    <div className="bg-muted/50 border-b border-border p-2 flex items-center gap-2 text-nexus-memory">
                        <Database className="w-4 h-4 text-purple-500" />
                        <span className="font-bold tracking-wider text-foreground">MEMORY CONTEXT</span>
                    </div>
                    <div className="flex-1 p-4 grid grid-cols-2 gap-2 overflow-y-auto content-start">
                        {[1,2,3,4].map((i) => (
                            <div key={i} className="bg-muted/20 border border-border p-2 rounded text-[10px] text-muted-foreground hover:border-purple-500/50 transition-all cursor-crosshair">
                                <div className="flex justify-between mb-1 text-purple-500">
                                    <span>DOC_{100+i}</span>
                                    <span>0.9{i}</span>
                                </div>
                                <div className="h-1 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-purple-500" style={{width: `${80 + i*4}%`}} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </>
        ) : (
            <>
                {/* SYSTEM LAYER VIEW */}
                <div className="col-span-1 row-span-2 glass-panel bg-zinc-950 border border-border rounded-xl overflow-hidden flex flex-col">
                    <div className="bg-zinc-900 border-b border-zinc-800 p-2 flex items-center justify-between text-emerald-500">
                        <div className="flex items-center gap-2">
                             <Activity className="w-4 h-4" />
                             <span className="font-bold tracking-wider">eBPF KERNEL STREAM</span>
                        </div>
                        <span className="text-[9px] px-1 border border-emerald-900 bg-emerald-950 rounded">HOOKS_ACTIVE</span>
                    </div>
                    <div className="flex-1 p-4 font-mono text-[10px] text-emerald-500/70 overflow-hidden relative">
                        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.5)_50%)] bg-[size:100%_4px] pointer-events-none" />
                        <div className="space-y-1">
                            {ebpfLogs.map((log, i) => (
                                <div key={i} className="hover:text-emerald-400 transition-colors cursor-default">{log}</div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="col-span-1 row-span-1 glass-panel bg-card border border-border rounded-xl p-4 flex flex-col gap-4">
                     <div className="flex items-center justify-between">
                         <h3 className="font-bold text-muted-foreground flex items-center gap-2"><Cpu className="w-4 h-4" /> NPU TELEMETRY</h3>
                         <span className="text-primary font-mono">120 TOPS</span>
                     </div>
                     <div className="flex-1 flex items-end gap-1 border-b border-border pb-2">
                         {npuLoad.map((v, i) => (
                             <div key={i} className="flex-1 bg-primary/20 hover:bg-primary/50 transition-all relative group" style={{height: `${v}%`}}>
                                 <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 text-[9px] bg-background border border-border px-1 rounded opacity-0 group-hover:opacity-100">{v}%</div>
                             </div>
                         ))}
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                         <div className="p-3 bg-muted/30 rounded border border-border">
                             <div className="text-[10px] text-muted-foreground uppercase">Thermal</div>
                             <div className="text-xl font-mono text-orange-500">64°C</div>
                         </div>
                         <div className="p-3 bg-muted/30 rounded border border-border">
                             <div className="text-[10px] text-muted-foreground uppercase">Memory Bandwidth</div>
                             <div className="text-xl font-mono text-blue-500">840 GB/s</div>
                         </div>
                     </div>
                </div>

                 <div className="col-span-1 row-span-1 glass-panel bg-card border border-border rounded-xl p-4 flex flex-col">
                     <h3 className="font-bold text-muted-foreground mb-4 flex items-center gap-2"><Layers className="w-4 h-4" /> FEDERATED LEARNING</h3>
                     <div className="flex-1 flex flex-col justify-center items-center text-center gap-2">
                         <div className="w-16 h-16 rounded-full border-4 border-muted border-t-purple-500 animate-spin" />
                         <p className="text-xs text-muted-foreground">Syncing local gradients...</p>
                         <p className="text-[10px] text-zinc-500">Privacy Guarantee: Zero-Knowledge Proof Active</p>
                     </div>
                 </div>
            </>
        )}

      </div>
    </div>
  );
}

function CheckMark() {
    return (
        <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/50">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
        </div>
    )
}
