
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Terminal, ArrowRight, Zap, FileText, LayoutTemplate, BoxSelect } from "lucide-react";
import { useStore } from "../../context/StoreContext";
import { NexusPulse } from "../ui/NexusPulse";

export function GhostCommandBar() {
  const { isGhostBarOpen, setGhostBarOpen, addMessage, addToHistory, agent } = useStore();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setGhostBarOpen(!isGhostBarOpen);
      }
      if (e.key === "Escape" && isGhostBarOpen) {
        setGhostBarOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isGhostBarOpen, setGhostBarOpen]);

  useEffect(() => {
    if (isGhostBarOpen && inputRef.current) {
      inputRef.current.focus();
    } else {
        setInput("");
    }
  }, [isGhostBarOpen]);

  const handleSubmit = (cmd: string = input) => {
    if (!cmd.trim()) return;
    addMessage({
      id: Date.now().toString(),
      role: 'user',
      content: cmd,
      timestamp: new Date()
    });
    addToHistory(cmd);
    setGhostBarOpen(false);
  };

  const predictions = [
    { label: "Summarize recent logs", icon: FileText, type: "analysis" },
    { label: "Deploy to staging", icon: Zap, type: "action" },
    { label: "Run system diagnostics", icon: Terminal, type: "system" },
    { label: "Create new artifact", icon: LayoutTemplate, type: "creative" }
  ];

  const filteredPredictions = input ? predictions.filter(p => p.label.toLowerCase().includes(input.toLowerCase())) : predictions.slice(0, 2);

  return (
    <AnimatePresence>
      {isGhostBarOpen && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/10 backdrop-blur-[2px]">
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="w-full max-w-3xl flex flex-col items-center gap-6"
          >
            {/* Command Bar */}
            <div className="w-full relative glass-panel rounded-full p-2.5 flex items-center gap-4 pl-6 shadow-2xl ring-1 ring-white/20 bg-background/80 backdrop-blur-3xl">
                
                <div className="shrink-0">
                    <NexusPulse state={agent.isThinking ? 'thinking' : input ? 'action' : 'idle'} size={28} />
                </div>

                <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    placeholder="Describe your intent..."
                    className="flex-1 bg-transparent border-none focus:outline-none text-xl text-foreground placeholder:text-muted-foreground/50 font-light h-12"
                />

                <div className="flex items-center gap-2 pr-2">
                    {input && (
                        <button onClick={() => handleSubmit()} className="p-3 bg-foreground text-background rounded-full hover:scale-105 transition-transform shadow-lg">
                            <ArrowRight className="w-5 h-5" />
                        </button>
                    )}
                    {!input && (
                        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-muted/40 rounded-full border border-border/40">
                             <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                             <span className="text-[11px] text-muted-foreground font-mono font-medium">CMD+J</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Glass Tiles Predictions */}
            <div className="flex flex-wrap justify-center gap-4 w-full px-4">
                 <AnimatePresence mode="popLayout">
                    {filteredPredictions.map((pred, i) => (
                        <motion.button
                            key={pred.label}
                            initial={{ opacity: 0, y: 20, scale: 0.8 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ delay: i * 0.05, type: "spring", stiffness: 200, damping: 20 }}
                            onClick={() => handleSubmit(pred.label)}
                            className="glass-panel group relative overflow-hidden bg-card/40 hover:bg-card/60 border border-white/10 p-4 rounded-xl flex flex-col items-center justify-center gap-3 w-32 h-32 text-center transition-all hover:-translate-y-1 hover:shadow-xl backdrop-blur-md"
                        >
                            {/* Hover Gradient */}
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/10 group-hover:to-transparent transition-all duration-500" />
                            
                            <div className={`p-3 rounded-full ${pred.type === 'action' ? 'bg-orange-500/10 text-orange-500' : 'bg-primary/10 text-primary'} group-hover:scale-110 transition-transform duration-300`}>
                                <pred.icon className="w-6 h-6" />
                            </div>
                            <span className="text-xs font-medium text-foreground/80 leading-tight group-hover:text-foreground">{pred.label}</span>
                        </motion.button>
                    ))}
                 </AnimatePresence>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}