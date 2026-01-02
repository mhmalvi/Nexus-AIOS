
import React from "react";
import { Circle, Activity, Wifi, ShieldCheck, Cpu, HardDrive } from "lucide-react";
import { useStore } from "../../context/StoreContext";

export function StatusBar() {
  const { agent } = useStore();

  return (
    <div className="h-9 border-t border-border bg-background/60 backdrop-blur-md flex items-center justify-between px-4 text-[10px] select-none text-muted-foreground z-30 relative transition-colors duration-300">
      <div className="flex items-center gap-4">
        {/* Nexus Orb */}
        <div className="relative group cursor-pointer">
            <div className={`w-2 h-2 rounded-full transition-all duration-500 ${agent.isThinking ? 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.8)]' : 'bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]'}`} />
            <div className={`absolute inset-0 rounded-full animate-ping opacity-20 ${agent.isThinking ? 'bg-purple-500' : 'bg-blue-500'}`} />
        </div>
        
        <span className="font-mono tracking-widest text-muted-foreground">NEXUS_KERNEL_V2.4</span>
        
        <div className="h-3 w-px bg-border" />
        
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3 h-3 text-green-500/80" />
          <span className="text-muted-foreground">SECURE</span>
        </div>
      </div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {agent.isThinking && (
            <div className="flex items-center gap-2 px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full">
                <Cpu className="w-3 h-3 text-purple-400 animate-spin-slow" />
                <span className="text-purple-400">PROCESSING CONTEXT...</span>
            </div>
        )}
      </div>

      <div className="flex items-center gap-4">
         <div className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-help">
            <Activity className="w-3 h-3" />
            <span>Mem: 450MB</span>
         </div>
         <div className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-help">
            <HardDrive className="w-3 h-3" />
            <span>Disk: 82%</span>
         </div>
      </div>
    </div>
  );
}
