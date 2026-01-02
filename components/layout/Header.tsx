
import React from "react";
import { Bell, Search, Wifi, Battery, Command, Cpu } from "lucide-react";
import { Button } from "../ui/Button";
import { useStore } from "../../context/StoreContext";

export function Header() {
  const { setCommandPaletteOpen } = useStore();
  const [time, setTime] = React.useState(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-14 flex items-center justify-between px-6 select-none">
       {/* Left: Breadcrumbs / Window Title */}
       <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full border border-white/5 transition-colors cursor-pointer group">
             <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
             <span className="text-xs font-medium text-blue-100 tracking-wide">Nexus Online</span>
          </div>
       </div>

       {/* Center: Spotlight Search Trigger */}
       <button 
            onClick={() => setCommandPaletteOpen(true)}
            className="hidden md:flex items-center gap-3 px-4 py-2 bg-black/20 hover:bg-white/5 backdrop-blur-md rounded-xl border border-white/5 text-xs text-zinc-400 hover:text-white hover:border-white/20 transition-all group shadow-lg"
       >
            <Search className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
            <span className="tracking-wide">Omni-Search</span>
            <kbd className="bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[9px] font-mono text-zinc-500 group-hover:text-zinc-300">⌘K</kbd>
       </button>

       {/* Right: System Tray */}
       <div className="flex items-center gap-4">
         <div className="flex items-center gap-4 px-4 py-2 bg-black/20 backdrop-blur-md rounded-full border border-white/5 text-xs text-zinc-400">
            <div className="flex items-center gap-2 hover:text-white transition-colors cursor-help">
                <Wifi className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-center gap-2 hover:text-white transition-colors cursor-help">
                <Battery className="w-3.5 h-3.5" />
                <span className="hidden sm:inline font-mono">100%</span>
            </div>
            <div className="w-px h-3 bg-white/10" />
            <span className="font-mono text-zinc-300">{time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
         </div>
       </div>
    </header>
  );
}
