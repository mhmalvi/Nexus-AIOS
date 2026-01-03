
import React, { useState, useEffect, useRef } from "react";
import { Search, Command, Wifi, Battery, Bell, Cpu, Menu, Maximize, Sun, Moon, LayoutGrid, Eye, EyeOff, FileText, Monitor, PenTool, LogOut, Lock, Terminal, Calculator, Network, Check } from "lucide-react";
import { useStore } from "../../context/StoreContext";
import { NexusPulse } from "../ui/NexusPulse";
import { motion, AnimatePresence } from "framer-motion";

interface HeaderProps {
    onToggleNotifications: () => void;
    onSummarize: () => void;
}

export function Header({ onToggleNotifications, onSummarize }: HeaderProps) {
  const { agent, setCommandPaletteOpen, ui, setTheme, notifications, setFocusMode, setLocked, openWindow } = useStore();
  const [time, setTime] = useState(new Date());
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isSysTrayOpen, setIsSysTrayOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
            setActiveMenu(null);
            setIsSysTrayOpen(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
        clearInterval(timer);
        document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const menuItems: Record<string, { label: string, icon?: any, shortcut?: string, action: () => void }[]> = {
      'File': [
          { label: 'New Agent', icon: User, action: () => openWindow('agents') },
          { label: 'System Lock', icon: Lock, shortcut: 'Win+L', action: () => setLocked(true) },
          { label: 'Exit Session', icon: LogOut, action: () => window.location.reload() },
      ],
      'View': [
          { label: 'Focus Mode', icon: ui.focusMode ? EyeOff : Eye, action: () => setFocusMode(!ui.focusMode) },
          { label: 'Toggle Fullscreen', icon: Maximize, action: () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen() },
      ],
      'Tools': [
          { label: 'Terminal', icon: Terminal, action: () => openWindow('terminal') },
          { label: 'Command Palette', icon: Command, shortcut: 'Cmd+K', action: () => setCommandPaletteOpen(true) },
          { label: 'Neural Modules', icon: Box, action: () => openWindow('modules') },
      ]
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-[36px] z-[100] px-4 flex items-center justify-between select-none pointer-events-none text-xs" ref={menuRef}>
       
       {/* Glass Bar Container */}
       <div className={`absolute inset-0 transition-opacity duration-500 pointer-events-auto
            ${ui.focusMode ? 'opacity-0 pointer-events-none' : 'glass-panel border-b border-border/40 bg-background/60 backdrop-blur-xl shadow-sm'}`}>
       </div>

       {/* Left: Brand & Menus */}
       <div className={`flex items-center gap-4 relative z-10 pointer-events-auto transition-all duration-500 ${ui.focusMode ? 'translate-y-[-100px]' : ''}`}>
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
          
          <div className="h-3 w-px bg-border/40 hidden sm:block" />

          {/* Menus */}
          <nav className="hidden md:flex items-center gap-1">
             {Object.keys(menuItems).map((key) => (
                 <div key={key} className="relative">
                     <button 
                        onClick={() => setActiveMenu(activeMenu === key ? null : key)}
                        className={`px-3 py-1 rounded-md text-[10px] font-medium transition-all ${activeMenu === key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
                     >
                         {key}
                     </button>
                     
                     <AnimatePresence>
                         {activeMenu === key && (
                             <motion.div
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 5 }}
                                className="absolute top-full left-0 mt-1 w-48 bg-popover/95 backdrop-blur-xl border border-border/50 rounded-lg shadow-xl p-1 z-50 overflow-hidden"
                             >
                                 {menuItems[key].map((item, i) => (
                                     <button
                                        key={i}
                                        onClick={() => { item.action(); setActiveMenu(null); }}
                                        className="w-full text-left px-2 py-1.5 rounded flex items-center gap-2 text-[11px] hover:bg-primary/10 hover:text-primary transition-colors text-popover-foreground"
                                     >
                                         {item.icon && <item.icon className="w-3.5 h-3.5 opacity-70" />}
                                         <span className="flex-1">{item.label}</span>
                                         {item.shortcut && <span className="text-[9px] text-muted-foreground">{item.shortcut}</span>}
                                     </button>
                                 ))}
                             </motion.div>
                         )}
                     </AnimatePresence>
                 </div>
             ))}
          </nav>
       </div>

       {/* Focus Mode Toggle (Center) */}
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
         
         <button onClick={() => setFocusMode(true)} className="p-1.5 rounded-full hover:bg-muted/50 text-muted-foreground hover:text-primary transition-colors" title="Enter Focus Mode">
            <Eye className="w-3.5 h-3.5" />
         </button>

         <button onClick={() => setTheme(ui.theme === 'dark' ? 'light' : 'dark')} className="p-1.5 rounded-full hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
            {ui.theme === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
         </button>

         <button onClick={onToggleNotifications} className="relative p-1.5 rounded-full hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
             <Bell className="w-3.5 h-3.5" />
             {notifications.some(n => !n.read) && (
                 <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
             )}
         </button>

         <div className="h-4 w-px bg-border/40 mx-1 hidden lg:block" />

         {/* Metrics Interactive Area */}
         <div className="relative">
             <button 
                onClick={() => setIsSysTrayOpen(!isSysTrayOpen)}
                className={`hidden lg:flex items-center gap-3 text-[10px] font-mono text-muted-foreground/80 bg-muted/20 px-3 py-1 rounded-full border border-border/30 shadow-inner hover:bg-muted/40 transition-colors ${isSysTrayOpen ? 'bg-muted/50 text-foreground' : ''}`}
             >
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
             </button>

             {/* Control Center Popover */}
             <AnimatePresence>
                 {isSysTrayOpen && (
                     <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute top-full right-0 mt-2 w-64 bg-popover/95 backdrop-blur-2xl border border-border/50 rounded-xl shadow-2xl p-3 z-50"
                     >
                         <div className="space-y-3">
                             <div className="flex items-center justify-between pb-2 border-b border-border/50">
                                 <h4 className="font-bold text-xs">Control Center</h4>
                                 <span className="text-[10px] text-muted-foreground font-mono">v3.1.0</span>
                             </div>
                             
                             <div className="space-y-2">
                                 <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                                     <div className="flex items-center gap-2">
                                         <div className="p-1.5 bg-primary/20 rounded text-primary"><Cpu className="w-3 h-3" /></div>
                                         <span className="text-xs">Performance</span>
                                     </div>
                                     <span className="text-[10px] font-bold text-primary">BOOST</span>
                                 </div>
                                 <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                                     <div className="flex items-center gap-2">
                                         <div className="p-1.5 bg-green-500/20 rounded text-green-500"><Wifi className="w-3 h-3" /></div>
                                         <span className="text-xs">Network</span>
                                     </div>
                                     <span className="text-[10px] text-muted-foreground">Secure</span>
                                 </div>
                                 <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                                     <div className="flex items-center gap-2">
                                         <div className="p-1.5 bg-orange-500/20 rounded text-orange-500"><Battery className="w-3 h-3" /></div>
                                         <span className="text-xs">Power</span>
                                     </div>
                                     <span className="text-[10px] text-muted-foreground">84%</span>
                                 </div>
                             </div>

                             <button 
                                onClick={() => setLocked(true)}
                                className="w-full py-1.5 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded text-[10px] font-bold flex items-center justify-center gap-2 transition-colors"
                             >
                                 <Lock className="w-3 h-3" /> Lock Session
                             </button>
                         </div>
                     </motion.div>
                 )}
             </AnimatePresence>
         </div>
       </div>
    </header>
  );
}

// Helper icons
function User(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> }
function Box(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" x2="12" y1="22.08" y2="12"/></svg> }
