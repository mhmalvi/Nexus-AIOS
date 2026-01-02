
import React from "react";
import { Brain, Cpu, Database, Shield, Activity, Terminal, GitBranch } from "lucide-react";
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
      case 'worker': return <Brain className="w-3 h-3 text-blue-500" />;
      case 'supervisor': return <Shield className="w-3 h-3 text-amber-500" />;
      case 'memory': return <Database className="w-3 h-3 text-purple-500" />;
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
      {/* Scroll Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-xs scrollbar-hide"
      >
        {thoughtStream.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 opacity-50">
            <div className="w-10 h-10 rounded-full border border-dashed border-muted-foreground flex items-center justify-center animate-spin-slow">
                <Cpu className="w-5 h-5" />
            </div>
            <p className="text-[10px] tracking-widest uppercase">Kernel Idle</p>
          </div>
        ) : (
          thoughtStream.map((thought, idx) => (
            <div
              key={`${thought.id}-${idx}`}
              className={`relative pl-3 pb-2 border-l border-border last:border-0 
                         animate-in fade-in slide-in-from-right-4 duration-500`}
            >
              <div className={`absolute -left-[3px] top-1.5 w-1.5 h-1.5 rounded-full z-10 ring-2 ring-background
                ${thought.type === 'error' ? 'bg-red-500' : 
                  thought.type === 'action' ? 'bg-yellow-500' : 
                  thought.component === 'supervisor' ? 'bg-amber-500' : 'bg-blue-500'}`} 
              />
              
              <div className={`p-2 rounded-lg backdrop-blur-sm border transition-all hover:bg-muted/30
                ${thought.type === 'error' 
                  ? 'bg-red-500/10 border-red-500/20 text-red-500 dark:text-red-200'
                  : 'bg-muted/10 border-border text-foreground'
              }`}>
                <div className="flex items-center gap-2 mb-1 opacity-70">
                    {getIcon(thought.component)}
                    <span className="text-[9px] uppercase tracking-wider font-bold truncate max-w-[120px]">
                      {getLabel(thought.component)}
                    </span>
                    <span className="ml-auto text-[9px] opacity-40 font-mono">
                      {thought.timestamp.toLocaleTimeString([], {minute:'2-digit', second:'2-digit'})}
                    </span>
                </div>
                
                <p className="leading-relaxed opacity-90 text-[11px]">
                  {thought.content}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* Footer / Clear */}
      <div className="p-2 border-t border-border flex justify-end">
          <button 
             onClick={clearThoughts}
             className="text-[9px] text-muted-foreground hover:text-foreground uppercase tracking-wider px-2 py-1 hover:bg-muted/20 rounded transition-colors"
          >
              Flush Logs
          </button>
      </div>
    </div>
  );
}
