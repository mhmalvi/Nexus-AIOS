
import React, { useState, useEffect } from "react";
import { Mic, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface VoiceIndicatorProps {
  isListening: boolean;
  transcript: string;
}

export function VoiceIndicator({
  isListening,
  transcript
}: VoiceIndicatorProps) {
  // Generate a set of bars for visualization
  const [levels, setLevels] = useState<number[]>(new Array(20).fill(10));
  
  useEffect(() => {
    if (!isListening) return;
    
    const interval = setInterval(() => {
      setLevels(prev => prev.map((_, i) => {
          // Create a wave-like effect mixed with randomness
          const base = Math.sin(Date.now() / 200 + i * 0.5) * 30 + 50;
          const noise = Math.random() * 40;
          return Math.max(10, Math.min(100, base + noise));
      }));
    }, 50);
    
    return () => clearInterval(interval);
  }, [isListening]);

  return (
    <AnimatePresence>
      {isListening && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[90] flex flex-col items-center gap-8 pointer-events-none w-full max-w-2xl px-4">
          
          {/* Transcript HUD */}
          <AnimatePresence mode="wait">
            {transcript && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -10, scale: 0.95, filter: "blur(10px)" }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="bg-background/60 backdrop-blur-2xl border border-white/10 dark:border-white/5 rounded-3xl px-8 py-5 shadow-[0_8px_32px_rgba(0,0,0,0.12)] max-w-xl text-center relative overflow-hidden group"
              >
                  {/* Subtle shine effect */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-purple-500/5 pointer-events-none" />
                  
                  <p className="relative text-2xl font-light leading-relaxed font-sans text-foreground/90 tracking-wide">
                      "{transcript}"
                      <motion.span 
                        animate={{ opacity: [1, 0, 1] }} 
                        transition={{ duration: 0.8, repeat: Infinity }}
                        className="inline-block w-2.5 h-6 bg-primary ml-2 align-text-bottom rounded-sm shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                      />
                  </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Visualizer Dock */}
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.8 }}
            transition={{ type: "spring", bounce: 0.4 }}
            className="flex items-center gap-6 px-8 py-4 rounded-full bg-background/80 dark:bg-black/80 backdrop-blur-3xl border border-white/20 dark:border-white/10 shadow-[0_0_60px_-15px_rgba(var(--primary),0.3)] ring-1 ring-white/10"
          >
            
            {/* Status Icon */}
            <div className="relative">
               <motion.div 
                 animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }}
                 transition={{ duration: 2, repeat: Infinity }}
                 className="absolute inset-0 bg-red-500 rounded-full blur-md"
               />
               <div className="relative w-12 h-12 rounded-full bg-gradient-to-b from-red-500 to-red-700 flex items-center justify-center shadow-lg border border-white/10 group">
                 <Mic className="w-5 h-5 text-white drop-shadow-md group-hover:scale-110 transition-transform" />
               </div>
            </div>
            
            {/* Audio Bars */}
            <div className="flex items-end gap-1 h-10 w-48 justify-center pb-2">
               {levels.map((level, i) => (
                  <motion.div
                    key={i}
                    animate={{ 
                        height: `${Math.max(15, level)}%`,
                        backgroundColor: level > 80 ? 'rgb(var(--primary))' : 'rgba(var(--foreground), 0.5)' 
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="w-1.5 rounded-full"
                    style={{
                        opacity: 0.4 + (level / 200)
                    }}
                  />
               ))}
            </div>
            
            {/* Metadata */}
            <div className="pl-6 border-l border-white/10 flex flex-col justify-center min-w-[100px]">
                 <div className="flex items-center gap-2 mb-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_red]" />
                    <span className="text-[10px] font-bold text-foreground/90 uppercase tracking-[0.2em]">Live</span>
                 </div>
                 <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
                    <Activity className="w-3 h-3" />
                    <span>16kHz • Mono</span>
                 </div>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
