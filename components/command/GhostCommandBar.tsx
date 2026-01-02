
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Terminal, ArrowRight, Zap, FileText } from "lucide-react";
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

  const predictions = input.length > 2 ? [
    { label: "Summarize recent logs", icon: FileText, type: "analysis" },
    { label: "Deploy to staging", icon: Zap, type: "action" },
    { label: "Run system diagnostics", icon: Terminal, type: "system" }
  ] : [];

  return (
    <AnimatePresence>
      {isGhostBarOpen && (
        <div className="fixed inset-x-0 bottom-12 z-[100] flex flex-col items-center justify-end pointer-events-none">
          
          <div className="flex gap-4 mb-4 pointer-events-auto">
             <AnimatePresence>
                {predictions.map((pred, i) => (
                    <motion.button
                        key={i}
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.9 }}
                        transition={{ delay: i * 0.05, type: "spring", stiffness: 300, damping: 25 }}
                        onClick={() => handleSubmit(pred.label)}
                        className="glass-panel bg-card/90 px-4 py-3 rounded-xl flex items-center gap-3 text-sm text-foreground hover:bg-muted/80 transition-colors group shadow-lg border border-border"
                    >
                        <div className={`p-1.5 rounded-lg ${pred.type === 'action' ? 'bg-orange-500/10 text-orange-500' : 'bg-blue-500/10 text-blue-500'}`}>
                            <pred.icon className="w-4 h-4" />
                        </div>
                        <span className="font-medium">{pred.label}</span>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity -ml-1">
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        </div>
                    </motion.button>
                ))}
             </AnimatePresence>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="w-full max-w-2xl pointer-events-auto"
          >
            <div className="glass-panel rounded-full p-2 flex items-center gap-3 pl-5 shadow-2xl ring-1 ring-border bg-background/80 backdrop-blur-3xl">
                
                <div className="shrink-0">
                    <NexusPulse state={agent.isThinking ? 'thinking' : input ? 'action' : 'idle'} size={24} />
                </div>

                <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    placeholder="Describe your intent..."
                    className="flex-1 bg-transparent border-none focus:outline-none text-lg text-foreground placeholder:text-muted-foreground/60 font-light h-10"
                />

                <div className="flex items-center gap-2 pr-2">
                    {input && (
                        <button onClick={() => handleSubmit()} className="p-2 bg-foreground text-background rounded-full hover:scale-105 transition-transform">
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    )}
                    {!input && (
                        <div className="flex items-center gap-1 px-3 py-1 bg-muted rounded-full border border-border">
                             <Sparkles className="w-3 h-3 text-muted-foreground" />
                             <span className="text-[10px] text-muted-foreground font-mono">CMD+J</span>
                        </div>
                    )}
                </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
