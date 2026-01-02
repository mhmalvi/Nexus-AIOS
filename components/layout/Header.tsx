
import React, { useState, useEffect, useRef } from "react";
import { Search, Wifi, Command, Bell, Wand2, X, MessageSquare, Box, Layout } from "lucide-react";
import { useStore } from "../../context/StoreContext";
import { SearchResult, WindowState } from "../../types";

interface HeaderProps {
    onToggleNotifications: () => void;
    onSummarize: () => void;
}

export function Header({ onToggleNotifications, onSummarize }: HeaderProps) {
  const { setCommandPaletteOpen, activeConversation, artifacts, windows, openWindow, focusWindow, notifications } = useStore();
  const [time, setTime] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Omni-Search Logic
  useEffect(() => {
    if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
    }
    
    const query = searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    // 1. Index Windows
    (Object.values(windows) as WindowState[]).forEach(win => {
        if (win.id.includes(query) || win.id.replace('-', ' ').includes(query)) {
            results.push({
                id: win.id,
                type: 'window',
                title: win.id.charAt(0).toUpperCase() + win.id.slice(1).replace('-', ' '),
                subtitle: win.isOpen ? 'Active Window' : 'Application',
                action: () => { openWindow(win.id); focusWindow(win.id); }
            });
        }
    });

    // 2. Index Messages
    activeConversation.forEach(msg => {
        if (msg.content.toLowerCase().includes(query)) {
            results.push({
                id: msg.id,
                type: 'message',
                title: msg.role === 'user' ? 'You said...' : 'Nexus said...',
                subtitle: msg.content.substring(0, 40) + '...',
                action: () => { openWindow('chat'); focusWindow('chat'); }
            });
        }
    });

    // 3. Index Artifacts
    artifacts.forEach(art => {
        if (art.title.toLowerCase().includes(query) || art.content.toLowerCase().includes(query)) {
            results.push({
                id: art.id,
                type: 'artifact',
                title: art.title,
                subtitle: 'Generated Artifact',
                action: () => { /* Logic to focus artifact */ }
            });
        }
    });

    setSearchResults(results.slice(0, 6));
  }, [searchQuery, activeConversation, artifacts, windows]);

  // Click outside to close search dropdown
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
              setIsSearchFocused(false);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="h-10 w-full bg-background/60 backdrop-blur-2xl border-b border-border/50 flex items-center justify-between px-4 select-none pointer-events-auto z-50">
       {/* Left: Branding & Menu */}
       <div className="flex items-center gap-4">
          <div className="group flex items-center gap-2 cursor-pointer opacity-90 hover:opacity-100 transition-opacity">
             <div className="w-4 h-4 rounded-[4px] bg-gradient-to-br from-primary via-purple-500 to-blue-600 shadow-sm group-hover:shadow-glow transition-shadow" />
             <span className="text-sm font-bold text-foreground tracking-tight">Nexus OS</span>
          </div>
          <div className="h-4 w-px bg-border/40 mx-2" />
          <nav className="hidden md:flex items-center gap-1">
             {['File', 'Edit', 'View', 'Window', 'Help'].map((item) => (
                 <button key={item} className="px-3 py-1 rounded-md hover:bg-foreground/5 text-xs font-medium text-muted-foreground hover:text-foreground transition-all">
                     {item}
                 </button>
             ))}
          </nav>
       </div>

       {/* Center: Omni-Search Bar */}
       <div className="relative w-[360px]" ref={searchRef}>
            <div className={`flex items-center gap-2 px-3 py-1.5 bg-muted/30 border border-border/30 rounded-lg transition-all group ${isSearchFocused ? 'bg-background ring-1 ring-primary/50' : 'hover:bg-muted/50'}`}>
                <Search className={`w-3.5 h-3.5 ${isSearchFocused ? 'text-primary' : 'text-muted-foreground'}`} />
                <input 
                    className="flex-1 bg-transparent border-none outline-none text-xs text-foreground placeholder:text-muted-foreground/70"
                    placeholder="Search system, messages, or files..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                />
                {searchQuery ? (
                    <button onClick={() => setSearchQuery("")}><X className="w-3 h-3 text-muted-foreground hover:text-foreground" /></button>
                ) : (
                    <div className="flex items-center gap-1 text-[9px] text-muted-foreground/50 font-mono bg-background/50 px-1.5 rounded">
                        <Command className="w-2.5 h-2.5" /> K
                    </div>
                )}
            </div>

            {/* Instant Results Dropdown */}
            {isSearchFocused && searchQuery && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-background/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-100">
                    {searchResults.length > 0 ? (
                        <div className="py-1">
                            <div className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Best Match</div>
                            {searchResults.map((result) => (
                                <button 
                                    key={result.id} 
                                    onClick={() => { result.action(); setIsSearchFocused(false); }}
                                    className="w-full text-left px-3 py-2 hover:bg-primary/10 flex items-center gap-3 transition-colors"
                                >
                                    <div className="p-1.5 rounded bg-muted/50 border border-border/50">
                                        {result.type === 'window' && <Layout className="w-3.5 h-3.5 text-blue-500" />}
                                        {result.type === 'message' && <MessageSquare className="w-3.5 h-3.5 text-green-500" />}
                                        {result.type === 'artifact' && <Box className="w-3.5 h-3.5 text-purple-500" />}
                                    </div>
                                    <div>
                                        <div className="text-xs font-medium text-foreground">{result.title}</div>
                                        <div className="text-[10px] text-muted-foreground">{result.subtitle}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="p-4 text-center text-xs text-muted-foreground">No results found</div>
                    )}
                </div>
            )}
       </div>

       {/* Right: Controls */}
       <div className="flex items-center gap-3">
         
         {/* AI Summary Trigger */}
         <button 
            onClick={onSummarize}
            className="flex items-center gap-1.5 px-2 py-1 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 hover:from-indigo-500/20 hover:to-purple-500/20 border border-indigo-500/20 rounded-md transition-all text-xs font-medium text-indigo-500 hover:text-indigo-400 group"
            title="Summarize Active Window"
         >
             <Wand2 className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
             <span className="hidden lg:inline">Summarize</span>
         </button>

         <div className="h-4 w-px bg-border/40" />

         <div className="flex items-center gap-1">
             <div className="p-1.5 hover:bg-muted/50 rounded-md transition-colors cursor-pointer" title="Wi-Fi">
                <Wifi className="w-3.5 h-3.5 text-foreground" />
             </div>
             
             {/* Notification Trigger */}
             <button 
                onClick={onToggleNotifications}
                className="relative p-1.5 hover:bg-muted/50 rounded-md transition-colors cursor-pointer" 
                title="Notifications"
             >
                <Bell className="w-3.5 h-3.5 text-foreground" />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 border border-background" />
                )}
             </button>
             
             <div className="px-2 text-xs font-medium text-foreground">
                 {time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
             </div>
         </div>
       </div>
    </header>
  );
}
