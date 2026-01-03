
import React, { useState, useEffect, useRef } from "react";
import { Mic, Activity, Radio } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../context/StoreContext";

interface VoiceIndicatorProps {
  isListening: boolean;
  transcript: string;
}

export function VoiceIndicator({
  isListening,
  transcript
}: VoiceIndicatorProps) {
  const { ui } = useStore();
  const settings = ui.voiceSettings || { sensitivity: 1, responsiveness: 0.5, visualizerColor: 'primary' };
  
  // Generate a set of bars for visualization
  const [levels, setLevels] = useState<number[]>(new Array(20).fill(10));
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isListening) {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        return;
    }

    const updateLevels = () => {
        setLevels(prev => prev.map((current, i) => {
            // Base randomness + sine wave for organic feel
            const baseNoise = Math.random() * 50;
            const wave = Math.sin(Date.now() / 200 + i * 0.5) * 30;
            
            // Apply sensitivity multiplier
            let target = (30 + wave + baseNoise) * settings.sensitivity;
            target = Math.max(5, Math.min(100, target));

            // Apply smoothing (responsiveness)
            // Higher responsiveness = less smoothing (faster changes)
            // settings.responsiveness is 0.1 (slow) to 1.0 (instant)
            const smoothing = Math.max(0.1, settings.responsiveness); 
            const diff = target - current;
            
            return current + (diff * smoothing);
        }));
        animationRef.current = requestAnimationFrame(updateLevels);
    };

    updateLevels();
    
    return () => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isListening, settings.sensitivity, settings.responsiveness]);

  const getBarColor = (index: number, level: number) => {
      if (settings.visualizerColor === 'rainbow') {
          return `hsl(${(index * 15) + (level * 2)}, 70%, 50%)`;
      }
      if (settings.visualizerColor === 'monochrome') {
          return `rgba(255, 255, 255, ${Math.max(0.2, level / 100)})`;
      }
      // Primary default
      return level > 60 ? 'rgb(var(--primary))' : 'rgba(var(--foreground), 0.5)';
  };

  return (
    <AnimatePresence>
      {isListening && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[90] flex flex-col items-center gap-8 pointer-events-none w-full max-w-2xl px-4">
          
          {/* Glass-Effect Transcript HUD */}
          <AnimatePresence mode="wait">
            {transcript && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -10, scale: 0.9, filter: "blur(10px)" }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="bg-white/5 dark:bg-black/40 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-3xl px-8 py-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)] max-w-xl text-center relative overflow-hidden group"
              >
                  {/* Subtle shine effect animation */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent skew-x-12 translate-x-[-150%] animate-[shine_3s_infinite]" />
                  
                  <p className="relative text-2xl font-light leading-relaxed font-sans text-foreground/90 tracking-wide drop-shadow-sm">
                      "{transcript}"
                      <motion.span 
                        animate={{ opacity: [1, 0, 1] }} 
                        transition={{ duration: 0.8, repeat: Infinity }}
                        className="inline-block w-2 h-6 bg-primary ml-2 align-middle rounded-sm shadow-[0_0_10px_rgba(var(--primary),0.8)]"
                      />
                  </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Dynamic Visualizer Dock */}
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.8 }}
            transition={{ type: "spring", bounce: 0.4 }}
            className="flex items-center gap-6 px-8 py-4 rounded-full bg-background/80 dark:bg-black/80 backdrop-blur-3xl border border-white/20 dark:border-white/10 shadow-[0_0_60px_-15px_rgba(var(--primary),0.3)] ring-1 ring-white/10"
          >
            
            {/* Status Icon with Dynamic Ring */}
            <div className="relative">
               <motion.div 
                 animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                 transition={{ duration: 1.5 / settings.sensitivity, repeat: Infinity }}
                 className="absolute inset-0 bg-red-500 rounded-full blur-md"
               />
               <div className="relative w-12 h-12 rounded-full bg-gradient-to-b from-red-500 to-red-700 flex items-center justify-center shadow-lg border border-white/10 group overflow-hidden">
                 <Mic className="w-5 h-5 text-white drop-shadow-md z-10" />
                 {/* Internal liquid animation */}
                 <div className="absolute bottom-0 left-0 right-0 bg-black/20 h-1/2 animate-[wave_2s_infinite_linear]" />
               </div>
            </div>
            
            {/* Real-time Audio Bars */}
            <div className="flex items-end gap-1.5 h-12 w-56 justify-center pb-2 px-2">
               {levels.map((level, i) => (
                  <motion.div
                    key={i}
                    animate={{ 
                        height: `${Math.max(10, level)}%`,
                        backgroundColor: getBarColor(i, level)
                    }}
                    transition={{ type: "tween", ease: "linear", duration: 0.05 }}
                    className="w-1.5 rounded-full shadow-[0_0_5px_rgba(255,255,255,0.1)]"
                    style={{
                        opacity: 0.6 + (level / 200)
                    }}
                  />
               ))}
            </div>
            
            {/* Technical Metadata */}
            <div className="pl-6 border-l border-white/10 flex flex-col justify-center min-w-[100px] gap-0.5">
                 <div className="flex items-center gap-2 mb-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_red]" />
                    <span className="text-[10px] font-bold text-foreground/90 uppercase tracking-[0.2em]">Live Input</span>
                 </div>
                 <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground font-mono">
                    <Radio className="w-3 h-3" />
                    <span>{(settings.sensitivity * 100).toFixed(0)}% Gain</span>
                 </div>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
