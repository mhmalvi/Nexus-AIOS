
import React from "react";
import { useStore } from "../../context/StoreContext";
import { Brain, Shield, Code, BarChart3, Activity, GitCommit, CheckCircle, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function SwarmCluster() {
  const { swarm } = useStore();

  const getIcon = (avatar: string) => {
    switch(avatar) {
      case 'Brain': return <Brain className="w-5 h-5" />;
      case 'Shield': return <Shield className="w-5 h-5" />;
      case 'Code': return <Code className="w-5 h-5" />;
      case 'BarChart': return <BarChart3 className="w-5 h-5" />;
      default: return <Activity className="w-5 h-5" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'thinking': return 'text-primary bg-primary/10 border-primary/30';
      case 'executing': return 'text-green-500 bg-green-500/10 border-green-500/30';
      case 'reviewing': return 'text-orange-500 bg-orange-500/10 border-orange-500/30';
      default: return 'text-muted-foreground bg-muted/30 border-border';
    }
  };

  return (
    <div className="h-full bg-background/50 flex flex-col p-6 overflow-hidden relative">
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none" />
      
      {/* Manager Node - Orchestrator */}
      <div className="flex justify-center mb-10 relative z-10">
        <AgentCard agent={swarm.find(a => a.id === 'manager')!} isManager />
      </div>

      {/* Connection Lines */}
      <div className="absolute top-[120px] left-0 right-0 h-20 flex justify-center pointer-events-none z-0">
          <svg className="w-full h-full">
              <path d="M 50% 0 L 50% 20 L 20% 50 L 20% 100" fill="none" stroke="currentColor" className="text-border/50" strokeWidth="1" />
              <path d="M 50% 0 L 50% 20 L 50% 100" fill="none" stroke="currentColor" className="text-border/50" strokeWidth="1" />
              <path d="M 50% 0 L 50% 20 L 80% 50 L 80% 100" fill="none" stroke="currentColor" className="text-border/50" strokeWidth="1" />
              
              {/* Animated Packets */}
              <circle r="2" fill="currentColor" className="text-primary animate-pulse">
                  <animateMotion dur="2s" repeatCount="indefinite" path="M 50% 0 L 50% 20 L 20% 50 L 20% 100" />
              </circle>
              <circle r="2" fill="currentColor" className="text-primary animate-pulse">
                  <animateMotion dur="2s" repeatCount="indefinite" begin="1s" path="M 50% 0 L 50% 20 L 80% 50 L 80% 100" />
              </circle>
          </svg>
      </div>

      {/* Worker Nodes */}
      <div className="grid grid-cols-3 gap-6 relative z-10">
        {swarm.filter(a => a.id !== 'manager').map((agent) => (
           <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}

function AgentCard({ agent, isManager = false }: { agent: any, isManager?: boolean }) {
  const isActive = agent.status !== 'idle';
  
  return (
    <motion.div 
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative group rounded-2xl border backdrop-blur-xl transition-all duration-300 overflow-hidden
            ${isManager ? 'w-[400px] h-[160px]' : 'h-[240px]'}
            ${isActive 
                ? 'bg-card/80 border-primary/30 shadow-[0_0_30px_-10px_rgba(var(--primary),0.3)]' 
                : 'bg-card/40 border-border shadow-sm grayscale-[0.5] hover:grayscale-0'}
        `}
    >
        {/* Active Scan Line */}
        {isActive && (
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent animate-[scan_3s_ease-in-out_infinite]" />
        )}

        <div className="p-5 flex flex-col h-full relative z-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        {getIcon(agent.avatar)}
                    </div>
                    <div>
                        <h3 className="font-bold text-sm tracking-wide">{agent.name}</h3>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{agent.role}</p>
                    </div>
                </div>
                {/* Confidence Meter (Circular) */}
                <div className="relative w-10 h-10 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90">
                        <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" className="text-muted/20" strokeWidth="3" />
                        <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" 
                            className={`${agent.confidence > 80 ? 'text-green-500' : 'text-primary'} transition-all duration-1000`} 
                            strokeWidth="3" 
                            strokeDasharray="100" 
                            strokeDashoffset={100 - agent.confidence} 
                        />
                    </svg>
                    <span className="absolute text-[9px] font-bold">{agent.confidence}%</span>
                </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 flex flex-col gap-2">
                <div className="flex items-center gap-2 mb-2">
                     <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${getStatusColor(agent.status)}`}>
                         {agent.status}
                     </span>
                     {agent.status === 'thinking' && <Activity className="w-3 h-3 text-primary animate-pulse" />}
                </div>
                
                <div className="bg-black/20 rounded p-2.5 flex-1 border border-white/5 font-mono text-[10px] text-muted-foreground overflow-hidden relative">
                    <p className="leading-relaxed opacity-80">
                        <span className="text-primary mr-1">task:</span> 
                        {agent.currentTask}
                    </p>
                    {/* Fake typing cursor */}
                    {isActive && <span className="inline-block w-1.5 h-3 bg-primary/50 animate-pulse ml-1 align-middle"/>}
                </div>
            </div>

            {/* Footer */}
            {!isManager && (
                <div className="mt-3 pt-3 border-t border-border/30 flex justify-between items-center text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>24ms</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <GitCommit className="w-3 h-3" />
                        <span>v3.0.1</span>
                    </div>
                </div>
            )}
        </div>
    </motion.div>
  );
}

function getIcon(avatar: string) {
    switch(avatar) {
      case 'Brain': return <Brain className="w-5 h-5" />;
      case 'Shield': return <Shield className="w-5 h-5" />;
      case 'Code': return <Code className="w-5 h-5" />;
      case 'BarChart': return <BarChart3 className="w-5 h-5" />;
      default: return <Activity className="w-5 h-5" />;
    }
}

function getStatusColor(status: string) {
    switch(status) {
      case 'thinking': return 'text-primary bg-primary/10 border-primary/30';
      case 'executing': return 'text-green-500 bg-green-500/10 border-green-500/30';
      case 'reviewing': return 'text-orange-500 bg-orange-500/10 border-orange-500/30';
      default: return 'text-muted-foreground bg-muted/30 border-border';
    }
}
