
import React, { useState } from "react";
import { Activity, Layout, MessageSquare, Database, Users, Settings, Cpu, Terminal } from "lucide-react";
import { useStore } from "../../context/StoreContext";
import { NexusPulse } from "../ui/NexusPulse";

export function StatusBar() {
  const { agent, windows, focusWindow } = useStore();
  const [hoveredApp, setHoveredApp] = useState<string | null>(null);

  const dockItems = [
    { id: 'chat', icon: MessageSquare, label: 'Communicator', color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { id: 'war-room', icon: Layout, label: 'War Room', color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { id: 'memory', icon: Database, label: 'Memory Core', color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { id: 'agents', icon: Users, label: 'Swarm', color: 'text-green-500', bg: 'bg-green-500/10' },
    { id: 'terminal', icon: Terminal, label: 'Terminal', color: 'text-zinc-400', bg: 'bg-zinc-500/10' }, // Visual only for now
    { id: 'settings', icon: Settings, label: 'Settings', color: 'text-foreground', bg: 'bg-foreground/10' },
  ];

  const handleTaskClick = (id: string) => {
      // Terminal is placeholder in this array, ignore
      if (id === 'terminal') return;
      
      const win = windows[id];
      if (win) {
          focusWindow(id); // Simple toggle/focus
      }
  };

  return (
    <div className="fixed bottom-6 left-0 right-0 z-[100] flex justify-center pointer-events-none">
        {/* Slim Floating Dock */}
        <div className="pointer-events-auto h-14 bg-background/20 backdrop-blur-2xl border border-white/10 rounded-full flex items-center px-6 gap-3 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.5)] ring-1 ring-white/5 transition-all duration-300">
            
            {/* Start / Nexus Button */}
            <div className="group relative">
                <button className="w-10 h-10 rounded-full bg-primary/20 hover:bg-primary/30 flex items-center justify-center transition-all duration-300 border border-primary/20 shadow-lg shadow-primary/10">
                    <NexusPulse state={agent.isThinking ? 'thinking' : 'idle'} size={20} />
                </button>
            </div>

            <div className="w-px h-8 bg-white/10 mx-1" />

            {/* Apps */}
            {dockItems.map((item) => {
                const win = windows[item.id];
                const isOpen = win?.isOpen;
                const isHovered = hoveredApp === item.id;
                
                return (
                    <div 
                        key={item.id}
                        className="relative flex flex-col items-center group"
                        onMouseEnter={() => setHoveredApp(item.id)}
                        onMouseLeave={() => setHoveredApp(null)}
                    >
                        {/* Tooltip */}
                        {isHovered && (
                            <div className="absolute -top-14 bg-zinc-900/90 text-white text-[10px] font-medium px-2 py-1 rounded-md backdrop-blur border border-white/10 whitespace-nowrap animate-in fade-in slide-in-from-bottom-2 shadow-xl">
                                {item.label}
                            </div>
                        )}

                        <button 
                            onClick={() => handleTaskClick(item.id)}
                            className={`
                                relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]
                                ${isOpen ? 'bg-white/10 shadow-inner' : 'hover:bg-white/5'}
                                ${isHovered ? '-translate-y-2 scale-110 mx-1' : ''}
                            `}
                        >
                            <item.icon className={`w-5 h-5 ${item.color} transition-transform duration-300`} />
                        </button>
                        
                        {/* Active Dot indicator */}
                        {isOpen && (
                            <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-primary shadow-[0_0_5px_rgba(var(--primary),0.8)]" />
                        )}
                    </div>
                )
            })}
        </div>
    </div>
  );
}
