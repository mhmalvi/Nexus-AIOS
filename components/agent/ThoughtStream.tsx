
import React from "react";
import { Brain, Cpu, Database, Shield, Activity, Terminal, GitBranch, Zap } from "lucide-react";
import { useStore } from "../../context/StoreContext";

export function ThoughtStream() {
  const { thoughtStream, clearThoughts } = useStore();
  const [isAutoScroll, setIsAutoScroll] = React.useState(true);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isAutoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thoughtStream, isAutoScroll]);

  const getIcon = (component: string) => {
    switch (component) {
      case 'scheduler': return <GitBranch className="w-3 h-3 text-pink-500" />;
      case 'worker': return <Brain className="w-3 h-3 text-nexus-brain" />;
      case 'supervisor': return <Shield className="w-3 h-3 text-nexus-alert" />;
      case 'memory': return <Database className="w-3 h-3 text-nexus-memory" />;
      default: return <Activity className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const getLabel = (component: string) => {
    switch (component) {
      case 'scheduler': return 'Context Scheduler';
      case 'worker': return 'Worker Agent';
      case 'supervisor': return 'Supervisor';
      case 'memory': return 'Memory Manager';
      default: return component;
    }
  };

  return (
    <div className="h-full flex flex-col bg-transparent">
      
      {/* Analytics Header */}
      <div className="h-24 p-4 border-b border-white/5 bg-black/20 flex gap-4 shrink-0">
          <div className="flex-1 rounded bg-white/5 border border-white/5 p-2 flex flex-col justify-between">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Events/Min</span>
              <div className="flex items-end gap-1 h-8">
                  {[40, 60, 30, 80, 50, 90, 40].map((h, i) => (
                      <div key={i} className="flex-1 bg-nexus-brain/50 rounded-sm" style={{height: `${h}%`}} />
                  ))}
              </div>
          </div>
          <div className="flex-1 rounded bg-white/5 border border-white/5 p-2 flex flex-col justify-between">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Health</span>
              <div className="flex items-center gap-2">
                 <Activity className="w-4 h-4 text-nexus-tool" />
                 <span className="text-sm font-bold text-nexus-tool">98%</span>
              </div>
          </div>
      </div>

      {/* Scroll Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-4 font-mono text-xs scrollbar-hide relative"
      >
        {/* Timeline Line */}
        <div className="absolute left-[19px] top-0 bottom-0 w-px bg-white/10" />

        {thoughtStream.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3 opacity-50">
            <div className="w-12 h-12 rounded-full border border-dashed border-white/20 flex items-center justify-center animate-spin-slow">
                <Cpu className="w-6 h-6 text-white/20" />
            </div>
            <p className="text-[10px] tracking-widest uppercase text-white/30">Kernel Idle</p>
          </div>
        ) : (
          thoughtStream.map((thought, idx) => (
            <div
              key={`${thought.id}-${idx}`}
              className={`relative pl-8 animate-in fade-in slide-in-from-right-4 duration-500`}
            >
              {/* Timeline Dot */}
              <div className={`absolute left-[15px] top-3 w-2.5 h-2.5 rounded-full z-10 ring-4 ring-black
                ${thought.type === 'error' ? 'bg-destructive shadow-[0_0_10px_rgba(255,59,48,0.5)]' : 
                  thought.type === 'action' ? 'bg-nexus-alert shadow-[0_0_10px_rgba(255,159,10,0.5)]' : 
                  thought.component === 'supervisor' ? 'bg-nexus-alert' : 
                  thought.component === 'memory' ? 'bg-nexus-memory' :
                  'bg-nexus-brain'}`} 
              />
              
              <div className={`p-3 rounded-lg backdrop-blur-sm border transition-all hover:bg-white/5 group
                ${thought.type === 'error' 
                  ? 'bg-destructive/10 border-destructive/20 text-destructive-foreground'
                  : 'bg-white/5 border-white/10 text-foreground'
              }`}>
                <div className="flex items-center gap-2 mb-1.5 opacity-70">
                    <span className={`p-1 rounded bg-black/50 ${
                        thought.component === 'worker' ? 'text-nexus-brain' :
                        thought.component === 'memory' ? 'text-nexus-memory' :
                        thought.component === 'supervisor' ? 'text-nexus-alert' :
                        'text-pink-500'
                    }`}>
                        {getIcon(thought.component)}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider font-bold truncate max-w-[120px] text-white/80">
                      {getLabel(thought.component)}
                    </span>
                    <span className="ml-auto text-[9px] opacity-40 font-mono">
                      {thought.timestamp.toLocaleTimeString([], {minute:'2-digit', second:'2-digit', hour12: false})}
                    </span>
                </div>
                
                <p className="leading-relaxed opacity-80 text-[11px] group-hover:opacity-100 transition-opacity">
                  {thought.content}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* Footer / Clear */}
      <div className="p-2 border-t border-white/10 flex justify-end bg-black/20">
          <button 
             onClick={clearThoughts}
             className="text-[9px] text-zinc-500 hover:text-white uppercase tracking-wider px-2 py-1 hover:bg-white/5 rounded transition-colors flex items-center gap-1"
          >
              <Zap className="w-3 h-3" />
              Flush Logs
          </button>
      </div>
    </div>
  );
}
