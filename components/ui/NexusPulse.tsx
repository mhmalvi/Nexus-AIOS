
import React from "react";
import { motion } from "framer-motion";

interface NexusPulseProps {
  state: 'idle' | 'thinking' | 'action';
  size?: number;
  className?: string;
}

export function NexusPulse({ state, size = 24, className = "" }: NexusPulseProps) {
  // Idle: Slow, rhythmic breathing
  const idleVariants = {
    animate: {
      scale: [1, 1.1, 1],
      opacity: [0.5, 0.8, 0.5],
      filter: ["brightness(1)", "brightness(1.1)", "brightness(1)"],
      transition: {
        duration: 4,
        repeat: Infinity,
        ease: "easeInOut"
      }
    }
  };

  // Thinking: Chaotic Nebula Swirl
  const thinkingVariants = {
    animate: {
      rotate: 360,
      scale: [0.9, 1.1, 0.9],
      transition: {
        rotate: { duration: 2, repeat: Infinity, ease: "linear" },
        scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
      }
    }
  };

  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      
      {/* 1. Core Light Source */}
      <motion.div
        layoutId="pulse-core"
        variants={state === 'idle' ? idleVariants : undefined}
        animate={state === 'idle' ? 'animate' : state === 'action' ? { scale: [1, 2, 0], opacity: [1, 1, 0] } : {}}
        transition={state === 'action' ? { duration: 0.3 } : undefined}
        className={`absolute inset-0 rounded-full blur-md
            ${state === 'action' ? 'bg-white' : 'bg-nexus-brain/60'}`}
      />
      
      {/* 2. Nebula Layers (Only when Thinking) */}
      {state === 'thinking' && (
        <>
            <motion.div
              animate={{ rotate: 360, scale: [1, 1.2, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="absolute inset-[-4px] rounded-full bg-gradient-to-tr from-nexus-memory via-transparent to-nexus-tool opacity-60 blur-md"
            />
            <motion.div
              animate={{ rotate: -360, scale: [1.2, 1, 1.2] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute inset-[-2px] rounded-full bg-gradient-to-bl from-nexus-brain via-transparent to-purple-500 opacity-60 blur-sm"
            />
        </>
      )}

      {/* 3. Action Beam (Flash) */}
      {state === 'action' && (
         <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: '200px', opacity: [0, 1, 0], width: [2, 4, 0] }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="absolute bottom-1/2 left-1/2 -translate-x-1/2 bg-white blur-[1px]"
         />
      )}

      {/* 4. Physical Orb Representation */}
      <motion.div
        className={`relative rounded-full z-10 transition-all duration-500 shadow-inner
          ${state === 'idle' ? 'w-2 h-2 bg-white/90 shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 
            state === 'thinking' ? 'w-3 h-3 bg-white/90 shadow-[0_0_15px_rgba(255,255,255,0.8)]' : 
            'w-4 h-4 bg-white ring-4 ring-white/30'}`}
      />
      
      {/* 5. Outer Ring Ripple (Idle only) */}
      {state === 'idle' && (
        <motion.div
           animate={{ scale: [1, 2], opacity: [0.3, 0] }}
           transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
           className="absolute inset-0 rounded-full border border-nexus-brain/30"
        />
      )}

    </div>
  );
}
