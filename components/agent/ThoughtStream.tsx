
import React from "react";
import { Brain, Cpu, Database, Shield, Activity, Terminal, GitBranch, Zap, ChevronRight, BarChart3, Lock, Server } from "lucide-react";
import { useStore } from "../../context/StoreContext";

// Simplified Sparkline
const Sparkline = ({ data, color, height = 30 }: { data: number[], color: string, height?: number }) => {
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const width = 100;
    
    const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((d - min) / range) * height;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
            <defs>
                <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={`M ${points} L ${width},${height} L 0,${height} Z`} fill={`url(#grad-${color})`} />
            <path d={`M ${points}`} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        </svg>
    );
};

export function ThoughtStream() {
  const { thoughtStream, clearThoughts } = useStore();
  const [isAutoScroll, setIsAutoScroll] = React.useState(true);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Mock data for charts
  const [cpuData, setCpuData] = React.useState([20, 30, 25, 40, 35, 50, 45, 60, 55, 40]);
  const [memData, setMemData] = React.useState([45, 46, 48, 47, 49, 50, 52, 51, 50, 51]);

  React.useEffect(() => {
    const interval = setInterval(() => {
       setCpuData(prev => [...prev.slice(1), Math.floor(Math.random() * 60) + 20]);
       setMemData(prev => [...prev.slice(1), Math.floor(Math.random() * 10) + 45]);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
      case 'scheduler': return 'Orchestrator';
      case 'worker': return 'Inference';
      case 'supervisor': return 'Safety Layer';
      case 'memory': return 'RAG Context';
      default: return component;
    }
  };

  return (
    <div className="h-full flex flex-col bg-background/50 text-foreground">
      
      {/* 1. Holographic Metrics HUD */}
      <div className="p-4 flex flex-col gap-4 border-b border-border/50 bg-background/30 backdrop-blur-md">
          <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">System Diagnostics</span>
              <div className="flex gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
                  <span className="text-[9px] font-mono text-green-500">ONLINE</span>
              </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
              <div className="p-2.5 rounded-lg bg-card/40 border border-border/50 shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Cpu className="w-3 h-3" />
                          <span className="text-[9px] font-bold">Neural Load</span>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-primary">{cpuData[cpuData.length-1]}%</span>
                  </div>
                  <Sparkline data={cpuData} color="rgb(var(--primary))" height={24} />
              </div>

               <div className="p-2.5 rounded-lg bg-card/40 border border-border/50 shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Server className="w-3 h-3" />
                          <span className="text-[9px] font-bold">VRAM Usage</span>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-nexus-memory">{memData[memData.length-1]}GB</span>
                  </div>
                  <Sparkline data={memData} color="#BF5AF2" height={24} />
              </div>
          </div>
      </div>

      {/* 2. Stream Header */}
      <div className="px-4 py-2 bg-muted/20 border-b border-border/40 text-[10px] font-bold text-muted-foreground flex justify-between items-center backdrop-blur-sm">
          <span className="uppercase tracking-widest">Thought Process Log</span>
          <Activity className="w-3 h-3 opacity-50" />
      </div>

      {/* 3. Stream Content */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-5 font-mono text-xs scrollbar-hide relative bg-background/20"
      >
        {/* Connection Line */}
        <div className="absolute left-[22px] top-0 bottom-0 w-px bg-border/40" />

        {thoughtStream.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3 opacity-60">
            <Brain className="w-8 h-8 opacity-20" />
            <p className="text-[10px] tracking-widest uppercase">Awaiting Input...</p>
          </div>
        ) : (
          thoughtStream.map((thought, idx) => (
            <div
              key={`${thought.id}-${idx}`}
              className="relative pl-8 animate-in fade-in slide-in-from-right-4 duration-500"
            >
              {/* Timeline Node */}
              <div className={`absolute left-[18px] top-2.5 w-2 h-2 rounded-full z-10 ring-4 ring-background
                ${thought.type === 'error' ? 'bg-destructive' : 
                  thought.type === 'action' ? 'bg-nexus-alert' : 
                  'bg-muted-foreground'}`} 
              />
              
              <div className="group">
                <div className="flex items-center gap-2 mb-1">
                    <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-muted/40 border border-border/50">
                        {getIcon(thought.component)}
                        <span className="text-[9px] font-bold text-foreground/80 uppercase tracking-wider">
                            {getLabel(thought.component)}
                        </span>
                    </div>
                    <span className="ml-auto text-[9px] text-muted-foreground/60 font-mono">
                      {thought.timestamp.toLocaleTimeString([], {minute:'2-digit', second:'2-digit', hour12: false})}
                    </span>
                </div>
                
                <p className={`text-[11px] leading-relaxed transition-colors pl-1 border-l-2 border-transparent hover:border-border
                     ${thought.type === 'error' ? 'text-destructive' : 
                       thought.type === 'action' ? 'text-nexus-alert' : 
                       'text-muted-foreground group-hover:text-foreground'}`}>
                  {thought.content}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* 4. Footer */}
      <div className="p-2 border-t border-border/40 flex justify-end bg-muted/10 backdrop-blur-md">
          <button 
             onClick={clearThoughts}
             className="text-[10px] text-muted-foreground hover:text-foreground uppercase tracking-wider px-3 py-1.5 rounded hover:bg-muted/50 transition-all flex items-center gap-1.5"
          >
              <Zap className="w-3 h-3" />
              Clear Buffer
          </button>
      </div>
    </div>
  );
}
