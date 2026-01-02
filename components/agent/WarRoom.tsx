
import React, { useEffect, useState } from "react";
import { Terminal, ShieldCheck, Database, GitBranch, Cpu, Activity, Lock, AlertTriangle, Send } from "lucide-react";
import { useStore } from "../../context/StoreContext";
import { Button } from "../ui/Button";

export function WarRoom() {
  const { thoughtStream, addThought } = useStore();
  const [logs, setLogs] = useState<string[]>([]);
  const [delegationInput, setDelegationInput] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<'worker'|'memory'|'scheduler'>('worker');

  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        const newLog = `[${new Date().toISOString().split('T')[1].slice(0,-1)}] PROCESS_ID_${Math.floor(Math.random()*9000)+1000}: Executing batch operation...`;
        setLogs(prev => [newLog, ...prev].slice(0, 20));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleDelegate = () => {
    if(!delegationInput.trim()) return;
    
    addThought({
        id: Date.now().toString(),
        timestamp: new Date(),
        type: 'action',
        component: 'supervisor',
        content: `DELEGATION COMMAND: Dispatched task "${delegationInput}" to ${selectedAgent.toUpperCase()} agent.`
    });
    
    setTimeout(() => {
         addThought({
            id: (Date.now()+1).toString(),
            timestamp: new Date(),
            type: 'thought',
            component: selectedAgent,
            content: `Received delegation. Initiating sub-routine for: ${delegationInput}`
        });
    }, 800);

    setDelegationInput("");
  };

  return (
    <div className="h-full p-4 grid grid-cols-2 grid-rows-[2fr_1fr] gap-4 font-mono text-xs">
      
      {/* 1. Worker Agent (Terminal) - Uses dark theme always for terminal feel, or semantic? Let's use semantic but inverted for terminal. */}
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
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] z-10 pointer-events-none bg-[length:100%_2px,3px_100%]" />
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

      {/* 2. Orchestrator & Supervisor Split */}
      <div className="flex flex-col gap-4 col-span-1 row-span-2">
         {/* Supervisor (Audit) */}
        <div className="glass-panel bg-card border border-border rounded-xl overflow-hidden flex flex-col flex-1 shadow-sm">
            <div className="bg-muted/50 border-b border-border p-2 flex items-center justify-between text-nexus-alert">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-orange-500" />
                    <span className="font-bold tracking-wider text-foreground">SUPERVISOR / AUDIT</span>
                </div>
                <div className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 rounded text-[10px] text-orange-600 animate-pulse font-bold">
                    LIVE
                </div>
            </div>
            <div className="flex-1 p-4 flex flex-col gap-2">
                <div className="p-3 rounded bg-orange-500/5 border border-orange-500/20 flex items-center gap-3">
                    <Lock className="w-5 h-5 text-orange-500" />
                    <div>
                        <div className="font-bold text-foreground">Safety Guardrails Active</div>
                        <div className="text-muted-foreground">Monitoring tool execution params</div>
                    </div>
                </div>
                
                <div className="mt-2 text-muted-foreground space-y-2">
                    <div className="flex items-center justify-between">
                         <span>Permission Check</span>
                         <CheckMark /> 
                    </div>
                    <div className="w-full h-px bg-border" />
                    <div className="flex items-center justify-between">
                         <span>PII Redaction</span>
                         <CheckMark /> 
                    </div>
                    <div className="w-full h-px bg-border" />
                    <div className="flex items-center justify-between">
                         <span className="text-primary">Inference Latency</span>
                         <span className="font-mono text-foreground">45ms</span>
                    </div>
                </div>
            </div>
        </div>

        {/* Task Delegation Controls */}
        <div className="glass-panel bg-card border border-border rounded-xl overflow-hidden flex flex-col h-[40%] shadow-sm">
             <div className="bg-muted/50 border-b border-border p-2 flex items-center gap-2 text-foreground">
                <Cpu className="w-4 h-4 text-primary" />
                <span className="font-bold tracking-wider">MANUAL OVERRIDE / DELEGATE</span>
            </div>
            <div className="p-4 flex flex-col gap-3 h-full">
                <div className="flex gap-2">
                    {(['worker', 'memory', 'scheduler'] as const).map(agent => (
                        <button 
                            key={agent}
                            onClick={() => setSelectedAgent(agent)}
                            className={`px-3 py-1.5 rounded text-[10px] uppercase font-bold transition-all border ${
                                selectedAgent === agent 
                                ? 'bg-primary/20 border-primary text-primary shadow-sm' 
                                : 'bg-muted/30 border-transparent text-muted-foreground hover:bg-muted'
                            }`}
                        >
                            {agent}
                        </button>
                    ))}
                </div>
                <div className="flex gap-2 flex-1 items-end">
                    <input 
                        type="text" 
                        value={delegationInput}
                        onChange={(e) => setDelegationInput(e.target.value)}
                        placeholder={`Command for ${selectedAgent}...`}
                        className="flex-1 bg-muted/30 border border-border rounded px-3 py-2 focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
                        onKeyDown={(e) => e.key === 'Enter' && handleDelegate()}
                    />
                    <Button onClick={handleDelegate} size="icon" className="bg-primary hover:bg-primary/90 text-primary-foreground h-full w-10 rounded">
                        <Send className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
      </div>

      {/* 3. Memory Context (RAG) - Bottom Left */}
      <div className="glass-panel bg-card border border-border rounded-xl overflow-hidden flex flex-col col-span-1 row-span-1 shadow-sm">
        <div className="bg-muted/50 border-b border-border p-2 flex items-center gap-2 text-nexus-memory">
            <Database className="w-4 h-4 text-purple-500" />
            <span className="font-bold tracking-wider text-foreground">MEMORY / CONTEXT</span>
        </div>
        <div className="flex-1 p-4 grid grid-cols-2 gap-2 overflow-y-auto content-start">
             {[1,2,3,4].map((i) => (
                 <div key={i} className="bg-muted/20 border border-border p-2 rounded text-[10px] text-muted-foreground hover:border-purple-500/50 transition-all cursor-crosshair group">
                     <div className="flex justify-between mb-1 text-purple-500 group-hover:text-foreground transition-colors">
                         <span>DOC_CHUNK_{100+i}</span>
                         <span>0.9{i}</span>
                     </div>
                     <div className="h-1 bg-muted rounded-full overflow-hidden mb-1">
                         <div className="h-full bg-purple-500" style={{width: `${80 + i*4}%`}} />
                     </div>
                     <div className="truncate opacity-70">Vector embeddings loaded...</div>
                 </div>
             ))}
        </div>
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
