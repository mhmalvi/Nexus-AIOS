
import React, { useState, useEffect } from "react";
import { Shield, Globe, Activity, CheckCircle, AlertTriangle } from "lucide-react";
import { useStore } from "../../context/StoreContext";

export function StatusBar() {
  const { agent, ui, openWindow, addNotification, spawnArtifact } = useStore();
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

  const handleSecurityClick = () => {
      openWindow('war-room');
      addNotification({
          title: "Security Scan",
          message: "Opening War Room for deep inspection.",
          type: "info"
      });
  };

  const handleNetworkClick = () => {
      spawnArtifact({
          id: `net-graph-${Date.now()}`,
          title: "Network Telemetry",
          type: "analysis",
          content: `PING google.com (142.250.180.14): 56 data bytes\n64 bytes from 142.250.180.14: icmp_seq=0 ttl=116 time=12.1 ms\n64 bytes from 142.250.180.14: icmp_seq=1 ttl=116 time=11.8 ms\n\n--- 142.250.180.14 ping statistics ---\n2 packets transmitted, 2 packets received, 0.0% packet loss`,
          isVisible: true
      });
  };

  const handleMemoryClick = () => {
      openWindow('memory');
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 h-[28px] bg-white dark:bg-background border-t border-gray-200 dark:border-border flex items-center justify-between px-3 sm:px-4 font-sans text-[10px] select-none z-[100] transition-colors duration-300">
      
      {/* Left Cluster */}
      <div className="flex items-center gap-4">
        {/* Active Status Indicator - Always Visible */}
        <div className="flex items-center gap-2 cursor-pointer hover:bg-muted px-2 rounded transition-colors" title="Kernel Status">
            <div className={`w-1.5 h-1.5 rounded-full ${statusColor} ${isProcessing ? 'animate-pulse' : ''}`} />
            <span className="font-semibold text-gray-800 dark:text-foreground/90 tracking-wide">{statusLabel}</span>
        </div>

        {/* Security Badge - Visible on Small+ */}
        <button 
            onClick={handleSecurityClick}
            className="hidden sm:flex items-center gap-1.5 text-gray-500 dark:text-muted-foreground hover:text-green-500 transition-colors px-1.5 py-0.5 rounded hover:bg-green-500/10"
        >
            <Shield className="w-3 h-3" />
            <span className="font-medium">SECURE</span>
        </button>

        {/* Network Telemetry - Visible on Medium+ */}
        <button 
            onClick={handleNetworkClick}
            className="hidden md:flex items-center gap-1.5 text-gray-500 dark:text-muted-foreground hover:text-blue-500 transition-colors px-1.5 py-0.5 rounded hover:bg-blue-500/10"
        >
            <Globe className="w-3 h-3" />
            <span>Latency: {latency}ms</span>
        </button>
      </div>

      {/* Right Cluster */}
      <div className="flex items-center gap-4">
          {/* Resource Monitor - Visible on Medium+ */}
          <button 
            onClick={handleMemoryClick}
            className="hidden md:flex items-center gap-1.5 text-gray-500 dark:text-muted-foreground hover:text-purple-500 transition-colors px-1.5 py-0.5 rounded hover:bg-purple-500/10"
          >
              <Activity className="w-3 h-3" />
              <span>Mem: {memory}MB</span>
          </button>

          {/* System Versioning - Visible on Small+ */}
          <div className="hidden sm:flex items-center pl-4 border-l border-gray-200 dark:border-border h-3 hover:text-foreground transition-colors cursor-help" title="Check for updates">
             <span className="text-gray-500 dark:text-muted-foreground">Nexus Core v3.1.0</span>
          </div>
      </div>
    </div>
  );
}
