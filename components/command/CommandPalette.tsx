
import React, { useEffect } from "react";
import { Command } from "cmdk";
import { 
  Calculator, 
  Settings, 
  User,
  Mic,
  Trash2,
  Activity,
  Database,
  Moon,
  Sun,
  Laptop,
  History,
  Terminal
} from "lucide-react";
import { useStore } from "../../context/StoreContext";

export function CommandPalette() {
  const { 
    isCommandPaletteOpen, 
    setCommandPaletteOpen, 
    setTheme, 
    clearThoughts,
    startListening,
    stopListening,
    agent,
    commandHistory,
    addMessage
  } = useStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandPaletteOpen(!isCommandPaletteOpen);
      }
      if (e.key === " " && e.altKey) {
        e.preventDefault();
        setCommandPaletteOpen(!isCommandPaletteOpen);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [isCommandPaletteOpen, setCommandPaletteOpen]);

  const runCommand = (cmd: string) => {
    addMessage({
        id: Date.now().toString(),
        role: 'user',
        content: cmd,
        timestamp: new Date()
    });
    setCommandPaletteOpen(false);
  };

  const itemClass = "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-foreground";

  return (
    <Command.Dialog
      open={isCommandPaletteOpen}
      onOpenChange={setCommandPaletteOpen}
      label="Global Command Menu"
      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-popover/95 backdrop-blur-xl border border-border shadow-2xl rounded-xl z-[100] overflow-hidden p-0 animate-in fade-in zoom-in-95 duration-100"
    >
      <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
        <Command.Input 
          placeholder="Type a command or search..." 
          className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 border-none focus:ring-0"
        />
      </div>
      
      <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden p-2">
        <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
          No results found.
        </Command.Empty>

        {commandHistory.length > 0 && (
            <Command.Group heading="Recent History" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {commandHistory.slice(0, 3).map((cmd, i) => (
                    <Command.Item key={i} onSelect={() => runCommand(cmd)} className={itemClass}>
                        <History className="mr-2 h-4 w-4" />
                        <span className="truncate">{cmd}</span>
                    </Command.Item>
                ))}
            </Command.Group>
        )}

        <Command.Group heading="Actions" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          <Command.Item onSelect={() => { agent.isListening ? stopListening() : startListening(); setCommandPaletteOpen(false); }} className={itemClass}>
            <Mic className="mr-2 h-4 w-4" />
            <span>{agent.isListening ? 'Stop Listening' : 'Start Listening'}</span>
          </Command.Item>
          <Command.Item onSelect={() => { clearThoughts(); setCommandPaletteOpen(false); }} className={itemClass}>
            <Trash2 className="mr-2 h-4 w-4" />
            <span>Clear Thought Stream</span>
          </Command.Item>
          <Command.Item className={itemClass}>
            <Activity className="mr-2 h-4 w-4" />
            <span>System Status</span>
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Navigation" className="px-2 py-1.5 text-xs font-medium text-muted-foreground pt-2">
           <Command.Item className={itemClass}>
             <Database className="mr-2 h-4 w-4" />
             <span>Go to Memory Bank</span>
           </Command.Item>
           <Command.Item className={itemClass}>
             <Settings className="mr-2 h-4 w-4" />
             <span>Settings</span>
           </Command.Item>
        </Command.Group>

        <Command.Group heading="Theme" className="px-2 py-1.5 text-xs font-medium text-muted-foreground pt-2">
          <Command.Item onSelect={() => setTheme('light')} className={itemClass}>
            <Sun className="mr-2 h-4 w-4" />
            <span>Light Mode</span>
          </Command.Item>
          <Command.Item onSelect={() => setTheme('dark')} className={itemClass}>
            <Moon className="mr-2 h-4 w-4" />
            <span>Dark Mode</span>
          </Command.Item>
          <Command.Item onSelect={() => setTheme('system')} className={itemClass}>
            <Laptop className="mr-2 h-4 w-4" />
            <span>System</span>
          </Command.Item>
        </Command.Group>
      </Command.List>
      
      <div className="border-t bg-muted/20 px-4 py-2 text-[10px] text-muted-foreground flex justify-between">
        <span>Nexus AIOS v1.0</span>
        <div className="flex gap-2">
            <span>Use arrows to navigate</span>
            <span>Enter to select</span>
        </div>
      </div>
    </Command.Dialog>
  );
}
