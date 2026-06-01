
import React, { useEffect, useState } from "react";
import { Command } from "cmdk";
import { 
  Calculator, Settings, User, Mic, Trash2, Activity, Database, Moon, Sun, Laptop, 
  History, Terminal, Palette, Box, MessageSquare, Search, ArrowRight, FileCode
} from "lucide-react";
import { useStore } from "../../context/StoreContext";
import { Artifact, Message } from "../../types";

export function CommandPalette() {
  const { 
    isCommandPaletteOpen, 
    setCommandPaletteOpen, 
    setTheme,
    clearThoughts,
    startListening,
    stopListening,
    agent,
    activeConversation,
    focusWindow,
    openWindow,
    artifacts
  } = useStore();

  const [search, setSearch] = useState("");

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandPaletteOpen(!isCommandPaletteOpen);
      }
      if (e.key === "Escape" && isCommandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [isCommandPaletteOpen, setCommandPaletteOpen]);

  const itemClass = "relative flex cursor-pointer select-none items-center rounded-lg px-3 py-2.5 text-sm outline-none aria-selected:bg-primary/10 aria-selected:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-foreground transition-all duration-200 group";
  const headingClass = "px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-2";

  if (!isCommandPaletteOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] px-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        onClick={() => setCommandPaletteOpen(false)}
      />

      {/* Palette Container */}
      <div className="relative w-full max-w-2xl glass-panel shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 ring-1 ring-border/50 flex flex-col max-h-[60vh]">
        <Command 
            className="w-full flex flex-col h-full bg-card/50"
            filter={(value, search) => {
                if (value.toLowerCase().includes(search.toLowerCase())) return 1;
                return 0;
            }}
        >
          <div className="flex items-center border-b border-border px-4 h-14 shrink-0 bg-card/30">
            <Search className="w-5 h-5 text-muted-foreground mr-3" />
            <Command.Input 
              value={search}
              onValueChange={setSearch}
              placeholder="Search Kernel..." 
              autoFocus
              className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground border-none focus:ring-0 text-foreground h-full font-light"
            />
             <div className="flex gap-1">
                 <kbd className="bg-muted px-2 py-1 rounded text-[10px] text-muted-foreground font-mono border border-border shadow-sm">ESC</kbd>
             </div>
          </div>
          
          <div className="flex-1 overflow-hidden flex">
              {/* Main List */}
              <Command.List className="flex-1 overflow-y-auto p-2 scrollbar-hide min-w-[200px]">
                <Command.Empty className="py-10 text-center text-sm text-muted-foreground">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No results found.
                </Command.Empty>

                {/* --- Content Search Groups --- */}
                {artifacts.length > 0 && (
                    <Command.Group heading="Artifacts" className={headingClass}>
                        {artifacts.map(art => (
                            <Command.Item 
                                key={art.id} 
                                value={`${art.title} ${art.content}`}
                                onSelect={() => { /* Focus artifact */ setCommandPaletteOpen(false); }} 
                                className={itemClass}
                            >
                                <div className="p-1.5 rounded bg-purple-500/10 text-purple-500 mr-3">
                                    <FileCode className="h-4 w-4" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-medium">{art.title}</span>
                                    <span className="text-[10px] text-muted-foreground">{art.type}</span>
                                </div>
                            </Command.Item>
                        ))}
                    </Command.Group>
                )}

                {activeConversation.length > 0 && (
                    <Command.Group heading="Conversation" className={headingClass}>
                        {activeConversation.slice().reverse().slice(0, 10).map(msg => (
                            <Command.Item 
                                key={msg.id} 
                                value={msg.content}
                                onSelect={() => { openWindow('chat'); focusWindow('chat'); setCommandPaletteOpen(false); }} 
                                className={itemClass}
                            >
                                <div className={`p-1.5 rounded mr-3 ${msg.role === 'user' ? 'bg-muted text-muted-foreground' : 'bg-blue-500/10 text-blue-500'}`}>
                                    <MessageSquare className="h-4 w-4" />
                                </div>
                                <span className="truncate max-w-[300px] text-foreground/80">{msg.content}</span>
                            </Command.Item>
                        ))}
                    </Command.Group>
                )}

                {/* --- System Groups --- */}
                <Command.Group heading="System" className={headingClass}>
                    <Command.Item value="Toggle Voice" onSelect={() => { agent.isListening ? stopListening() : startListening(); setCommandPaletteOpen(false); }} className={itemClass}>
                        <div className="p-1.5 rounded bg-red-500/10 text-red-500 mr-3">
                             <Mic className="h-4 w-4" />
                        </div>
                        <span>{agent.isListening ? 'Stop Listening' : 'Start Listening'}</span>
                    </Command.Item>
                    <Command.Item value="Clear Memory" onSelect={() => { clearThoughts(); setCommandPaletteOpen(false); }} className={itemClass}>
                        <div className="p-1.5 rounded bg-orange-500/10 text-orange-500 mr-3">
                            <Trash2 className="h-4 w-4" />
                        </div>
                        <span>Clear Thought Stream</span>
                    </Command.Item>
                </Command.Group>

                <Command.Group heading="Appearance" className={headingClass}>
                    <Command.Item value="Light Mode" onSelect={() => setTheme('light')} className={itemClass}>
                        <div className="p-1.5 rounded bg-yellow-500/10 text-yellow-500 mr-3">
                            <Sun className="h-4 w-4" />
                        </div>
                        <span>Light Mode</span>
                    </Command.Item>
                    <Command.Item value="Dark Mode" onSelect={() => setTheme('dark')} className={itemClass}>
                        <div className="p-1.5 rounded bg-indigo-500/10 text-indigo-500 mr-3">
                            <Moon className="h-4 w-4" />
                        </div>
                        <span>Dark Mode</span>
                    </Command.Item>
                </Command.Group>
              </Command.List>

              {/* Preview Panel */}
              <div className="w-[280px] bg-secondary/30 border-l border-border p-4 hidden md:flex flex-col items-center justify-center text-center">
                  <div className="p-4 bg-background rounded-full shadow-sm mb-3">
                      <Command className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">Nexus OS</h3>
                  <p className="text-xs text-muted-foreground mt-2 px-2">
                      Use arrow keys to navigate. Type to search across system files, memory blocks, and active agents.
                  </p>
              </div>
          </div>
          
          <div className="border-t border-border bg-card/30 px-4 py-2 text-[10px] text-muted-foreground flex justify-between shrink-0">
            <span>v3.1 Stable</span>
            <div className="flex gap-3">
                <span className="flex items-center gap-1">Select <kbd className="bg-muted px-1 rounded font-mono">↵</kbd></span>
            </div>
          </div>
        </Command>
      </div>
    </div>
  );
}