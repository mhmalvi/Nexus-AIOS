
import React from "react";
import { MessageSquare, Layout, Database, Users, Settings, Terminal, Mic } from "lucide-react";
import { useStore } from "../../context/StoreContext";
import { motion, AnimatePresence } from "framer-motion";

export function Dock() {
  const { windows, focusWindow, openWindow, activeWindowId, minimizeWindow, ui, setGhostBarOpen, agent, startListening, stopListening } = useStore();

  const dockItems = [
    { id: 'chat', icon: MessageSquare, label: 'Communicator' },
    { id: 'war-room', icon: Layout, label: 'Mission Control' },
    { id: 'memory', icon: Database, label: 'Memory Core' },
    { id: 'agents', icon: Users, label: 'Swarm Cluster' },
    { id: 'settings', icon: Settings, label: 'System' },
  ];

  const handleAppClick = (id: string) => {
    if (!windows[id]?.isOpen) {
      openWindow(id);
    } else {
      if (activeWindowId === id && !windows[id].isMinimized) {
          minimizeWindow(id);
      } else {
          focusWindow(id);
      }
    }
  };

  const handleVoiceToggle = () => {
    // Visual/Haptic simulation could go here if using the Vibration API
    if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
    }
    
    if (agent.isListening) stopListening();
    else startListening();
  };

  if (ui.focusMode) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-24 z-[90] flex justify-center items-end pb-6 pointer-events-auto hover:pointer-events-auto group">
        {/* Floating Dock Container - Slide up on hover */}
        <div className="bg-background/80 dark:bg-black/60 backdrop-blur-3xl px-3 py-2.5 rounded-2xl flex items-center gap-2 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.3)] border border-white/20 dark:border-white/10 ring-1 ring-black/5 dark:ring-white/5 transition-transform duration-300 ease-out translate-y-[150%] group-hover:translate-y-0 relative">
            
            {dockItems.map((item) => {
                const isOpen = windows[item.id]?.isOpen;
                const isActive = activeWindowId === item.id;
                
                return (
                    <div key={item.id} className="relative group/icon flex flex-col items-center">
                        <motion.button
                            onClick={() => handleAppClick(item.id)}
                            whileHover={{ scale: 1.15, y: -4 }}
                            whileTap={{ scale: 0.9 }}
                            className={`
                                w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 relative
                                ${isActive 
                                    ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(var(--primary),0.4)]' 
                                    : 'bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground dark:hover:bg-white/10'
                                }
                            `}
                        >
                            <item.icon className="w-5 h-5 stroke-[1.5]" />
                        </motion.button>
                        
                        {/* Active Indicator Dot */}
                        {isOpen && (
                            <motion.div 
                                layoutId="active-dock-dot"
                                className={`absolute -bottom-1 w-1 h-1 rounded-full ${isActive ? 'bg-primary' : 'bg-muted-foreground/30'}`} 
                            />
                        )}

                        {/* Enhanced Tooltip */}
                        <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover/icon:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap scale-95 group-hover/icon:scale-100 transform origin-bottom">
                            <div className="px-3 py-1.5 bg-popover/90 text-popover-foreground text-[11px] font-medium rounded-lg shadow-xl border border-border/50 backdrop-blur-md">
                                {item.label}
                            </div>
                        </div>
                    </div>
                )
            })}

            <div className="w-px h-6 bg-border/40 mx-2" />

            {/* Voice Actions - Interactive Microphone Button */}
            <div className="relative group/icon flex flex-col items-center">
                <motion.button 
                    onClick={handleVoiceToggle}
                    whileHover={{ scale: 1.15, y: -4 }}
                    whileTap={{ scale: 0.9 }}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 relative overflow-hidden
                        ${agent.isListening 
                            ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)] ring-2 ring-red-500/50' 
                            : 'bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                        }`}
                >
                    {/* Pulsing ring when active */}
                    {agent.isListening && (
                        <span className="absolute inset-0 rounded-xl bg-red-400 opacity-30 animate-ping" />
                    )}
                    
                    <Mic className={`w-5 h-5 stroke-[1.5] relative z-10 ${agent.isListening ? 'animate-pulse' : ''}`} />
                </motion.button>
                
                 <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover/icon:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap scale-95 group-hover/icon:scale-100 transform origin-bottom">
                    <div className="px-3 py-1.5 bg-popover/90 text-popover-foreground text-[11px] font-medium rounded-lg shadow-xl border border-border/50 backdrop-blur-md">
                        {agent.isListening ? 'Stop Listening' : 'Start Voice Input'}
                    </div>
                </div>
            </div>

            {/* Quick Actions (Terminal) */}
            <div className="relative group/icon flex flex-col items-center">
                <motion.button 
                    onClick={() => handleAppClick('terminal')}
                    whileHover={{ scale: 1.15, y: -4 }}
                    whileTap={{ scale: 0.9 }}
                    className={`
                        w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 relative
                        ${activeWindowId === 'terminal' 
                            ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(var(--primary),0.4)]' 
                            : 'bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground dark:hover:bg-white/10'
                        }
                    `}
                >
                    <Terminal className="w-5 h-5 stroke-[1.5]" />
                </motion.button>
                {windows['terminal']?.isOpen && (
                    <motion.div 
                        layoutId="active-dock-dot-terminal"
                        className={`absolute -bottom-1 w-1 h-1 rounded-full ${activeWindowId === 'terminal' ? 'bg-primary' : 'bg-muted-foreground/30'}`} 
                    />
                )}
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 group-hover/icon:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap scale-95 group-hover/icon:scale-100 transform origin-bottom">
                    <div className="px-3 py-1.5 bg-popover/90 text-popover-foreground text-[11px] font-medium rounded-lg shadow-xl border border-border/50 backdrop-blur-md">
                        Terminal
                    </div>
                </div>
            </div>

        </div>
    </div>
  );
}
