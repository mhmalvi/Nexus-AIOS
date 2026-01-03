
import React, { useState, useEffect } from "react";
import { Shield, Globe, Activity } from "lucide-react";
import { useStore } from "../../context/StoreContext";

export function StatusBar() {
  const { agent, ui } = useStore();
  const [latency, setLatency] = useState(12);
  const [memory, setMemory] = useState(450);

  useEffect(() => {
    const interval = setInterval(() => {
        // Simulate fluctuating metrics for liveliness
        setLatency(prev => Math.max(5, prev + (Math.random() > 0.5 ? 2 : -2)));
        setMemory(prev => Math.max(400, prev + (Math.random() > 0.5 ? 5 : -5)));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  if (ui.focusMode) return null;

  const isProcessing = agent.isThinking || agent.isListening;
  // Spec: Hex #22C55E for Success Green, Orange for Idle.
  const statusColor = isProcessing ? 'bg-[#22C55E]' : 'bg-orange-500';
  const statusLabel = isProcessing ? 'PROCESSING' : 'IDLE';

  return (
    <div className="fixed bottom-0 left-0 right-0 h-[32px] bg-white dark:bg-background border-t border-gray-200 dark:border-border flex items-center justify-between px-4 font-sans text-[11px] select-none z-[100] transition-colors duration-300">
      
      {/* Left Cluster */}
      <div className="flex items-center gap-6">
        {/* Active Status Indicator */}
        <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${statusColor} ${isProcessing ? 'animate-pulse' : ''}`} />
            <span className="font-semibold text-gray-800 dark:text-foreground/90 tracking-wide">{statusLabel}</span>
        </div>

        {/* Security Badge */}
        <div className="flex items-center gap-2 text-gray-500 dark:text-muted-foreground">
            <Shield className="w-3.5 h-3.5" />
            <span className="font-medium">SECURE</span>
        </div>

        {/* Network Telemetry */}
        <div className="flex items-center gap-2 text-gray-500 dark:text-muted-foreground">
            <Globe className="w-3.5 h-3.5" />
            <span>Latency: {latency}ms</span>
        </div>
      </div>

      {/* Right Cluster */}
      <div className="flex items-center gap-6">
          {/* Resource Monitor */}
          <div className="flex items-center gap-2 text-gray-500 dark:text-muted-foreground">
              <Activity className="w-3.5 h-3.5" />
              <span>Mem: {memory}MB</span>
          </div>

          {/* System Versioning */}
          <div className="flex items-center pl-6 border-l border-gray-200 dark:border-border h-4">
             <span className="text-gray-500 dark:text-muted-foreground">Nexus Core v2.1.0</span>
          </div>
      </div>
    </div>
  );
}
