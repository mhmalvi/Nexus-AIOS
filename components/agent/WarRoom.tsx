
import React, { useEffect, useState } from "react";
import { Terminal, ShieldCheck, Database, GitBranch, Cpu, Activity, Lock, AlertTriangle } from "lucide-react";
import { useStore } from "../../context/StoreContext";

export function WarRoom() {
  const { thoughtStream } = useStore();
  const [logs, setLogs] = useState<string[]>([]);

  // Simulate terminal logs
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        const newLog = `[${new Date().toISOString().split('T')[1].slice(0,-1)}] PROCESS_ID_${Math.floor(Math.random()*9000)+1000}: Executing batch operation...`;
        setLogs(prev => [newLog, ...prev].slice(0, 20));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full p-4 grid grid-cols-2 grid-rows-2 gap-4 bg-zinc-950 text-zinc-100 font-mono text-xs">
      
      {/* 1. Worker Agent (Terminal) */}
      <div className="bg-black border border-zinc-800 rounded-xl overflow-hidden flex flex-col shadow-2xl relative group">
        <div className="bg-zinc-900 border-b border-zinc-800 p-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-400">
                <Terminal className="w-4 h-4" />
                <span className="font-bold tracking-wider">WORKER AGENT / TERMINAL</span>
            </div>
            <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500/20" />
                <div className="w-2 h-2 rounded-full bg-yellow-500/20" />
                <div className="w-2 h-2 rounded-full bg-green-500" />
            </div>
        </div>
        <div className="flex-1 p-4 font-mono text-zinc-400 overflow-hidden relative">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10 pointer-events-none bg-[length:100%_2px,3px_100%]" />
            <div className="space-y-1">
                {logs.map((log, i) => (
                    <div key={i} className="opacity-80 hover:opacity-100 hover:text-white transition-opacity">
                        <span className="text-blue-500 mr-2">$</span>
                        {log}
                    </div>
                ))}
                <div className="animate-pulse text-blue-400">_</div>
            </div>
        </div>
      </div>

      {/* 2. Orchestrator (Thoughts) */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden flex flex-col backdrop-blur-md">
        <div className="bg-zinc-900/80 border-b border-zinc-800 p-2 flex items-center gap-2 text-pink-400">
            <GitBranch className="w-4 h-4" />
            <span className="font-bold tracking-wider">ORCHESTRATOR / PLAN</span>
        </div>
        <div className="flex-1 p-4 overflow-y-auto space-y-3">
             {thoughtStream.filter(t => t.component === 'scheduler').slice(0, 10).map((t, i) => (
                 <div key={i} className="flex gap-3 items-start border-l-2 border-pink-500/30 pl-3">
                     <Cpu className="w-3 h-3 mt-0.5 text-pink-500 shrink-0" />
                     <p className="text-zinc-300 leading-tight">{t.content}</p>
                 </div>
             ))}
             {thoughtStream.length === 0 && <div className="text-zinc-600 italic">Waiting for task...</div>}
        </div>
      </div>

      {/* 3. Memory Context (RAG) */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden flex flex-col backdrop-blur-md">
        <div className="bg-zinc-900/80 border-b border-zinc-800 p-2 flex items-center gap-2 text-purple-400">
            <Database className="w-4 h-4" />
            <span className="font-bold tracking-wider">MEMORY / CONTEXT</span>
        </div>
        <div className="flex-1 p-4 grid grid-cols-2 gap-2 overflow-y-auto content-start">
             {[1,2,3,4].map((i) => (
                 <div key={i} className="bg-zinc-900 border border-zinc-700/50 p-2 rounded text-[10px] text-zinc-400 hover:border-purple-500/50 transition-colors cursor-crosshair">
                     <div className="flex justify-between mb-1 text-purple-300">
                         <span>DOC_CHUNK_{100+i}</span>
                         <span>0.9{i}</span>
                     </div>
                     <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mb-1">
                         <div className="h-full bg-purple-500" style={{width: `${80 + i*4}%`}} />
                     </div>
                     <div className="truncate">Vector embeddings loaded from LanceDB...</div>
                 </div>
             ))}
        </div>
      </div>

      {/* 4. Supervisor (Audit) */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden flex flex-col backdrop-blur-md">
        <div className="bg-zinc-900/80 border-b border-zinc-800 p-2 flex items-center justify-between text-amber-400">
            <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                <span className="font-bold tracking-wider">SUPERVISOR / AUDIT</span>
            </div>
            <div className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[10px]">
                SECURE
            </div>
        </div>
        <div className="flex-1 p-4 flex flex-col gap-2">
             <div className="p-3 rounded bg-amber-950/20 border border-amber-900/30 flex items-center gap-3">
                 <Lock className="w-5 h-5 text-amber-500" />
                 <div>
                     <div className="font-bold text-amber-200">Safety Guardrails Active</div>
                     <div className="text-zinc-500">Monitoring tool execution params</div>
                 </div>
             </div>
             
             <div className="mt-2 text-zinc-500 space-y-1">
                 <div className="flex items-center gap-2">
                     <CheckMark /> <span className="text-zinc-400">Permission Check</span>
                 </div>
                 <div className="flex items-center gap-2">
                     <CheckMark /> <span className="text-zinc-400">PII Redaction</span>
                 </div>
                 <div className="flex items-center gap-2">
                     <Activity className="w-3 h-3 text-blue-500 animate-pulse" /> <span className="text-blue-300">Real-time Inference</span>
                 </div>
             </div>
        </div>
      </div>

    </div>
  );
}

function CheckMark() {
    return (
        <div className="w-3 h-3 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/50">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
        </div>
    )
}
