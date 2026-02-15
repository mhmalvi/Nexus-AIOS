
import React from "react";
import { motion, Variants } from "framer-motion";

interface AetherPulseProps {
  state: 'idle' | 'thinking' | 'action';
  size?: number;
  className?: string;
}

export function AetherPulse({ state, size = 24, className = "" }: AetherPulseProps) {
  // Idle: Slow, rhythmic breathing with subtle glow
  const idleVariants: Variants = {
    animate: {
      scale: [1, 1.15, 1],
      opacity: [0.6, 0.9, 0.6],
      filter: ["brightness(1) blur(2px)", "brightness(1.2) blur(3px)", "brightness(1) blur(2px)"],
      transition: {
        duration: 4,
        repeat: Infinity,
        ease: "easeInOut"
      }
    }
  };

  // Thinking: Dynamic swirl of information
  const thinkingVariants: Variants = {
    animate: {
      rotate: 360,
      scale: [0.95, 1.1, 0.95],
      transition: {
        rotate: { duration: 3, repeat: Infinity, ease: "linear" },
        scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
      }
    }
  };

  // Action (Voice Input): Vibrant, high-frequency energy
  const actionVariants: Variants = {
    animate: {
      scale: [1, 1.3, 1],
      opacity: [0.8, 1, 0.8],
      transition: {
        duration: 0.8,
        repeat: Infinity,
        ease: "easeInOut"
      }
    }
  };

  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      
      {/* 1. Ambient Background Glow */}
      <motion.div
        layoutId="pulse-ambient"
        animate={{ 
          scale: state === 'thinking' ? [1.2, 1.5, 1.2] : 1,
          opacity: state === 'idle' ? 0.2 : 0.4
        }}
        className={`absolute inset-[-4px] rounded-full blur-xl
            ${state === 'action' ? 'bg-red-500/20' : 'bg-primary/20'}`}
      />

      {/* 2. Core Pulse Element */}
      <motion.div
        layoutId="pulse-core"
        variants={state === 'idle' ? idleVariants : state === 'action' ? actionVariants : thinkingVariants}
        animate="animate"
        className={`absolute inset-0 rounded-full blur-[2px] shadow-lg
            ${state === 'action' ? 'bg-red-400' : 'bg-primary'}`}
      />
      
      {/* 3. Nebula Layers (Thinking / Processing) */}
      {state === 'thinking' && (
        <>
            <motion.div
              animate={{ rotate: 360, scale: [1, 1.3, 1] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute inset-[-4px] rounded-full bg-gradient-to-tr from-nexus-memory/40 via-transparent to-nexus-tool/40 opacity-50 blur-md"
            />
            <motion.div
              animate={{ rotate: -360, scale: [1.3, 1, 1.3] }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
              className="absolute inset-[-2px] rounded-full bg-gradient-to-bl from-nexus-brain/40 via-transparent to-purple-500/40 opacity-50 blur-sm"
            />
        </>
      )}

      {/* 4. Physical Orb Representation */}
      <motion.div
        layout
        className={`relative rounded-full z-10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)] ring-1 ring-white/20
          ${state === 'idle' ? 'w-2 h-2 bg-white/95' : 
            state === 'thinking' ? 'w-2.5 h-2.5 bg-white' : 
            'w-2.5 h-2.5 bg-white animate-pulse'}`}
      />
      
      {/* 5. Ripple Effect (Idle Only) */}
      {state === 'idle' && (
        <motion.div
           animate={{ scale: [1, 2.5], opacity: [0.4, 0] }}
           transition={{ duration: 4, repeat: Infinity, ease: "easeOut" }}
           className="absolute inset-0 rounded-full border border-primary/20"
        />
      )}

    </div>
  );
}
