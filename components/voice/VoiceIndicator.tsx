
import React, { useState, useEffect } from "react";
import { Mic } from "lucide-react";

interface VoiceIndicatorProps {
  isListening: boolean;
  transcript: string;
}

export function VoiceIndicator({
  isListening,
  transcript
}: VoiceIndicatorProps) {
  const [audioLevel, setAudioLevel] = useState(0);
  
  useEffect(() => {
    if (!isListening) {
      setAudioLevel(0);
      return;
    }
    
    // Simulate fluid audio wave
    const interval = setInterval(() => {
      setAudioLevel(prev => {
         const target = Math.random() * 100;
         return prev + (target - prev) * 0.15; // Smoother lerp
      });
    }, 30);
    
    return () => clearInterval(interval);
  }, [isListening]);

  if (!isListening) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[90] flex flex-col items-center gap-4 pointer-events-none w-full max-w-lg">
      
      {/* Transcript HUD - Sleek Glass */}
      {transcript && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-background/40 backdrop-blur-3xl border border-white/10 rounded-2xl px-6 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.12)] max-w-md text-center">
                <p className="text-lg font-light leading-relaxed font-sans text-foreground/90">
                    "{transcript}"
                    <span className="inline-block w-1.5 h-4 bg-primary ml-1 align-middle animate-pulse rounded-full opacity-70"></span>
                </p>
            </div>
        </div>
      )}

      {/* Visualizer Dock */}
      <div className="animate-in zoom-in-95 duration-500 origin-bottom">
        <div className="flex items-center gap-4 px-5 py-3 rounded-full bg-black/80 backdrop-blur-2xl border border-white/10 shadow-[0_0_40px_-10px_rgba(var(--primary),0.3)]">
          
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping opacity-20" />
            <div className="relative w-8 h-8 rounded-full bg-gradient-to-tr from-red-500 to-pink-600 flex items-center justify-center shadow-lg shadow-red-500/20">
              <Mic className="w-4 h-4 text-white" />
            </div>
          </div>
          
          <div className="flex items-center gap-0.5 h-6">
               {[...Array(16)].map((_, i) => {
                  // Sine wave calculation for visualization
                  const offset = Math.abs(i - 7.5);
                  const multiplier = Math.max(0.1, 1 - offset / 8); 
                  const height = Math.max(3, audioLevel * 0.4 * multiplier * (0.8 + Math.random() * 0.4));
                  
                  return (
                    <div
                      key={i}
                      className="w-1 bg-white/80 rounded-full transition-all duration-[50ms] ease-out"
                      style={{
                        height: `${height}px`,
                        opacity: 0.3 + (height / 40) * 0.7
                      }}
                    />
                  );
               })}
          </div>
          
          <div className="pl-2 border-l border-white/10 flex flex-col">
               <span className="text-[9px] font-bold text-white/70 uppercase tracking-widest leading-none">Live Input</span>
               <span className="text-[9px] text-white/40 leading-tight">Listening...</span>
          </div>

        </div>
      </div>
    </div>
  );
}
