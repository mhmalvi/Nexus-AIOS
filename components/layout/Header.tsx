
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
    <header className="h-14 flex items-center justify-between px-6 select-none transition-colors duration-300">
       {/* Left: Breadcrumbs / Window Title */}
       <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-background/40 hover:bg-background/60 backdrop-blur-md rounded-full border border-border transition-colors cursor-pointer group shadow-sm">
             <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
             <span className="text-xs font-medium text-foreground tracking-wide">Nexus Online</span>
          </div>
       </div>

       {/* Center: Spotlight Search Trigger */}
       <button 
            onClick={() => setCommandPaletteOpen(true)}
            className="hidden md:flex items-center gap-3 px-4 py-2 bg-background/40 hover:bg-muted/20 backdrop-blur-md rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground hover:border-border/80 transition-all group shadow-sm"
       >
            <Search className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
            <span className="tracking-wide">Omni-Search</span>
            <kbd className="bg-muted border border-border rounded px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground group-hover:text-foreground">⌘K</kbd>
       </button>

       {/* Right: System Tray */}
       <div className="flex items-center gap-4">
         <div className="flex items-center gap-4 px-4 py-2 bg-background/40 backdrop-blur-md rounded-full border border-border text-xs text-muted-foreground shadow-sm">
            <div className="flex items-center gap-2 hover:text-foreground transition-colors cursor-help">
                <Wifi className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-center gap-2 hover:text-foreground transition-colors cursor-help">
                <Battery className="w-3.5 h-3.5" />
                <span className="hidden sm:inline font-mono">100%</span>
            </div>
            <div className="w-px h-3 bg-border" />
            <span className="font-mono text-foreground">{time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
         </div>
       </div>
    </header>
  );
}
