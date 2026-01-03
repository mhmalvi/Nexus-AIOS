
import React, { useState, useEffect } from "react";
import { Search, Command, Wifi, Battery, Bell, Cpu, Menu, Maximize, Sun, Moon, LayoutGrid, Eye, EyeOff } from "lucide-react";
import { useStore } from "../../context/StoreContext";
import { NexusPulse } from "../ui/NexusPulse";
import { motion, AnimatePresence } from "framer-motion";

interface HeaderProps {
    onToggleNotifications: () => void;
    onSummarize: () => void;
}

export function Header({ onToggleNotifications, onSummarize }: HeaderProps) {
  const { agent, setCommandPaletteOpen, ui, setTheme, notifications, setFocusMode } = useStore();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 h-[36px] z-[100] px-4 flex items-center justify-between select-none pointer-events-none text-xs">
       
       {/* Glass Bar Container */}
       <div className={`absolute inset-0 transition-opacity duration-500 pointer-events-auto
            ${ui.focusMode ? 'opacity-0 pointer-events-none' : 'glass-panel border-b border-border/40 bg-background/60 backdrop-blur-xl shadow-sm'}`}>
       </div>

       {/* Left: Brand & Mode */}
       <div className={`flex items-center gap-3 relative z-10 pointer-events-auto transition-all duration-500 ${ui.focusMode ? 'translate-y-[-100px]' : ''}`}>
          <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setCommandPaletteOpen(true)}>
             <NexusPulse 
                state={agent.isThinking ? 'thinking' : agent.isListening ? 'action' : 'idle'} 
                size={18} 
                className="transition-transform duration-300 group-hover:scale-110"
             />
             <div className="flex flex-col leading-none">
                 <span className="font-bold tracking-widest text-foreground/90 group-hover:text-primary transition-colors font-sans text-[11px]">NEXUS</span>
             </div>
          </div>
          
          <div className="h-3 w-px bg-border/40 mx-1 hidden sm:block" />

          {/* Menus - Hidden on mobile */}
          <nav className="hidden md:flex items-center gap-0.5">
             {['File', 'Edit', 'View', 'Tools'].map((item) => (
                 <button key={item} className="px-2.5 py-0.5 rounded-md hover:bg-muted/50 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-all">
                     {item}
                 </button>
             ))}
          </nav>
       </div>

       {/* Focus Mode Toggle */}
       <div className={`absolute top-1.5 left-1/2 -translate-x-1/2 pointer-events-auto z-20 transition-all duration-500 ${ui.focusMode ? 'translate-y-0' : 'translate-y-[-100px]'}`}>
             <button 
                onClick={() => setFocusMode(false)}
                className="bg-black/50 dark:bg-white/10 backdrop-blur-md border border-white/10 px-3 py-1 rounded-full text-[10px] font-bold text-white flex items-center gap-1.5 hover:bg-black/70 transition-all"
             >
                <EyeOff className="w-3 h-3" />
                Exit Focus
             </button>
       </div>

       {/* Right: System Status HUD */}
       <div className={`flex items-center gap-2 relative z-10 pointer-events-auto transition-all duration-500 ${ui.focusMode ? 'translate-y-[-100px]' : ''}`}>
         
         {/* Focus Mode Trigger */}
         <button onClick={() => setFocusMode(true)} className="p-1.5 rounded-full hover:bg-muted/50 text-muted-foreground hover:text-primary transition-colors" title="Enter Focus Mode">
            <Eye className="w-3.5 h-3.5" />
         </button>

         {/* Theme Toggle */}
         <button onClick={() => setTheme(ui.theme === 'dark' ? 'light' : 'dark')} className="p-1.5 rounded-full hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
            {ui.theme === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
         </button>

         {/* Notification Bell */}
         <button onClick={onToggleNotifications} className="relative p-1.5 rounded-full hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
             <Bell className="w-3.5 h-3.5" />
             {notifications.some(n => !n.read) && (
                 <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
             )}
         </button>

         <div className="h-4 w-px bg-border/40 mx-1 hidden lg:block" />

         {/* Metrics - Hidden on smaller screens */}
         <div className="hidden lg:flex items-center gap-3 text-[10px] font-mono text-muted-foreground/80 bg-muted/20 px-3 py-1 rounded-full border border-border/30 shadow-inner">
             <div className="flex items-center gap-1.5">
                 <Cpu className="w-3 h-3 text-primary" />
                 <span>32%</span>
             </div>
             <div className="w-px h-2.5 bg-border/40" />
             <div className="flex items-center gap-1.5">
                 <Wifi className="w-3 h-3 text-green-500" />
                 <span>5G</span>
             </div>
             <div className="w-px h-2.5 bg-border/40" />
             <span className="text-foreground font-semibold">
                 {time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
             </span>
         </div>
       </div>
    </header>
  );
}
