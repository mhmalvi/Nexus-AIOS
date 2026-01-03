
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
    <header className="fixed top-0 left-0 right-0 h-[48px] z-[100] px-6 flex items-center justify-between select-none pointer-events-none">
       
       {/* Glass Bar Container - Only renders background when needed or allows pass-through */}
       <div className={`absolute inset-0 transition-opacity duration-500 pointer-events-auto
            ${ui.focusMode ? 'opacity-0 pointer-events-none' : 'glass-panel border-b border-border/40 bg-background/60 backdrop-blur-xl shadow-sm'}`}>
       </div>

       {/* Left: Brand & Mode */}
       <div className={`flex items-center gap-4 relative z-10 pointer-events-auto transition-all duration-500 ${ui.focusMode ? 'translate-y-[-100px]' : ''}`}>
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setCommandPaletteOpen(true)}>
             <NexusPulse 
                state={agent.isThinking ? 'thinking' : agent.isListening ? 'action' : 'idle'} 
                size={22} 
                className="transition-transform duration-300 group-hover:scale-110"
             />
             <div className="flex flex-col leading-none">
                 <span className="text-sm font-bold tracking-widest text-foreground/90 group-hover:text-primary transition-colors font-sans">NEXUS</span>
                 <span className="text-[9px] font-mono text-muted-foreground/80 tracking-wide">OS v3.1</span>
             </div>
          </div>
          
          <div className="h-4 w-px bg-border/40 mx-2" />

          {/* Menus */}
          <nav className="hidden md:flex items-center gap-1">
             {['File', 'Edit', 'View', 'Tools'].map((item) => (
                 <button key={item} className="px-3 py-1 rounded-md hover:bg-muted/50 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-all">
                     {item}
                 </button>
             ))}
          </nav>
       </div>

       {/* Focus Mode Toggle (Always Visible/Accessible via specific trigger or hidden if active) */}
       <div className={`absolute top-3 left-1/2 -translate-x-1/2 pointer-events-auto z-20 transition-all duration-500 ${ui.focusMode ? 'translate-y-0' : 'translate-y-[-100px]'}`}>
             <button 
                onClick={() => setFocusMode(false)}
                className="bg-black/50 dark:bg-white/10 backdrop-blur-md border border-white/10 px-4 py-1.5 rounded-full text-xs font-bold text-white flex items-center gap-2 hover:bg-black/70 transition-all"
             >
                <EyeOff className="w-3.5 h-3.5" />
                Exit Focus Mode
             </button>
       </div>

       {/* Right: System Status HUD */}
       <div className={`flex items-center gap-3 relative z-10 pointer-events-auto transition-all duration-500 ${ui.focusMode ? 'translate-y-[-100px]' : ''}`}>
         
         {/* Focus Mode Trigger */}
         <button onClick={() => setFocusMode(true)} className="p-2 rounded-full hover:bg-muted/50 text-muted-foreground hover:text-primary transition-colors" title="Enter Focus Mode">
            <Eye className="w-4 h-4" />
         </button>

         {/* Theme Toggle */}
         <button onClick={() => setTheme(ui.theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-full hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
            {ui.theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
         </button>

         {/* Notification Bell */}
         <button onClick={onToggleNotifications} className="relative p-2 rounded-full hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
             <Bell className="w-4 h-4" />
             {notifications.some(n => !n.read) && (
                 <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
             )}
         </button>

         <div className="h-5 w-px bg-border/40 mx-1" />

         {/* Metrics */}
         <div className="hidden lg:flex items-center gap-4 text-[11px] font-mono text-muted-foreground/80 bg-muted/20 px-4 py-1.5 rounded-full border border-border/30 shadow-inner">
             <div className="flex items-center gap-2">
                 <Cpu className="w-3.5 h-3.5 text-primary" />
                 <span>32%</span>
             </div>
             <div className="w-px h-3 bg-border/40" />
             <div className="flex items-center gap-2">
                 <Wifi className="w-3.5 h-3.5 text-green-500" />
                 <span>5G</span>
             </div>
             <div className="w-px h-3 bg-border/40" />
             <span className="text-foreground font-semibold">
                 {time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
             </span>
         </div>
       </div>
    </header>
  );
}