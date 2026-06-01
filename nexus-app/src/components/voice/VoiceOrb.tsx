import React, { useMemo, useCallback } from "react";
import { Mic, MicOff, Loader2, Volume2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../context/StoreContext";

// ─── Types ──────────────────────────────────────────────────────────────────

type OrbState = "idle" | "listening" | "thinking" | "speaking" | "error";

interface VoiceOrbProps {
  onClick?: () => void;
  onLongPress?: () => void;
  size?: number;
  className?: string;
  showLabel?: boolean;
  disabled?: boolean;
  variant?: "default" | "compact" | "floating";
}

// ─── State Configs ──────────────────────────────────────────────────────────

const STATE_CONFIGS: Record<OrbState, {
  gradient: string;
  pulse: string;
  glow: string;
  label: string;
  icon: "mic" | "mic-off" | "loader" | "volume";
}> = {
  idle: {
    gradient: "from-zinc-700 via-zinc-800 to-zinc-900",
    pulse: "bg-zinc-500/20",
    glow: "",
    label: "Tap to speak",
    icon: "mic-off",
  },
  listening: {
    gradient: "from-red-500 via-red-600 to-red-800",
    pulse: "bg-red-500/30",
    glow: "shadow-[0_0_20px_rgba(239,68,68,0.4)]",
    label: "Listening…",
    icon: "mic",
  },
  thinking: {
    gradient: "from-blue-500 via-indigo-600 to-blue-800",
    pulse: "bg-blue-500/30",
    glow: "shadow-[0_0_20px_rgba(59,130,246,0.4)]",
    label: "Thinking…",
    icon: "loader",
  },
  speaking: {
    gradient: "from-emerald-500 via-teal-600 to-emerald-800",
    pulse: "bg-emerald-500/30",
    glow: "shadow-[0_0_20px_rgba(16,185,129,0.4)]",
    label: "Speaking…",
    icon: "volume",
  },
  error: {
    gradient: "from-orange-600 via-red-700 to-red-900",
    pulse: "bg-red-600/30",
    glow: "shadow-[0_0_20px_rgba(220,38,38,0.5)]",
    label: "Error — try again",
    icon: "mic-off",
  },
};

// ─── Waveform Bars Component ────────────────────────────────────────────────

function WaveformBars({ active, color }: { active: boolean; color: string }) {
  const barCount = 5;
  return (
    <div className="flex items-center gap-[2px] absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[120%]">
      {Array.from({ length: barCount }).map((_, i) => (
        <motion.div
          key={i}
          className={`w-[3px] rounded-full ${color}`}
          initial={{ height: 4 }}
          animate={active ? {
            height: [4, 12 + Math.random() * 8, 4],
          } : { height: 4 }}
          transition={{
            duration: 0.4 + Math.random() * 0.3,
            repeat: active ? Infinity : 0,
            delay: i * 0.08,
          }}
        />
      ))}
    </div>
  );
}

// ─── VoiceOrb Component ─────────────────────────────────────────────────────

export function VoiceOrb({
  onClick,
  onLongPress,
  size = 48,
  className = "",
  showLabel = false,
  disabled = false,
  variant = "default",
}: VoiceOrbProps) {
  const { agent } = useStore();

  // Derive state from store
  const state: OrbState = useMemo(() => {
    if (agent.isError) return "error";
    if (agent.isSpeaking) return "speaking";
    if (agent.isListening) return "listening";
    if (agent.isThinking) return "thinking";
    return "idle";
  }, [agent.isError, agent.isSpeaking, agent.isListening, agent.isThinking]);

  const config = STATE_CONFIGS[state];

  // Long press handling
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerDown = useCallback(() => {
    if (disabled) return;
    if (onLongPress) {
      longPressTimer.current = setTimeout(() => {
        onLongPress();
        longPressTimer.current = null;
      }, 500);
    }
  }, [disabled, onLongPress]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      onClick?.();
    }
  }, [onClick]);

  const handleClick = useCallback(() => {
    if (disabled) return;
    if (!onLongPress) onClick?.();
  }, [disabled, onClick, onLongPress]);

  // Dynamic sizing
  const iconSize = variant === "compact" ? size * 0.35 : size * 0.4;

  // Icon component
  const IconComponent = useMemo(() => {
    const props = {
      style: { width: iconSize, height: iconSize },
      className: "text-white drop-shadow-md z-10",
    };
    switch (config.icon) {
      case "mic": return <Mic {...props} />;
      case "loader": return (
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
          <Loader2 {...props} />
        </motion.div>
      );
      case "volume": return (
        <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>
          <Volume2 {...props} />
        </motion.div>
      );
      default: return <MicOff {...props} className="text-white/60 z-10" />;
    }
  }, [config.icon, iconSize]);

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <motion.button
        onClick={handleClick}
        onPointerDown={onLongPress ? handlePointerDown : undefined}
        onPointerUp={onLongPress ? handlePointerUp : undefined}
        onPointerLeave={onLongPress ? handlePointerUp : undefined}
        disabled={disabled}
        className={`relative rounded-full flex items-center justify-center
          bg-gradient-to-b ${config.gradient}
          border border-white/10 ${config.glow}
          cursor-pointer select-none
          hover:brightness-110 active:scale-95
          disabled:opacity-40 disabled:cursor-not-allowed
          transition-all duration-200`}
        style={{ width: size, height: size }}
        whileHover={disabled ? {} : { scale: 1.08 }}
        whileTap={disabled ? {} : { scale: 0.92 }}
        title={config.label}
        aria-label={config.label}
      >
        {/* Outer glow ring */}
        <AnimatePresence>
          {state !== "idle" && (
            <motion.div
              className={`absolute inset-0 rounded-full ${config.pulse}`}
              initial={{ scale: 1, opacity: 0 }}
              animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0, 0.4] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </AnimatePresence>

        {/* Second pulse ring for listening */}
        <AnimatePresence>
          {state === "listening" && (
            <motion.div
              className={`absolute inset-0 rounded-full ${config.pulse}`}
              initial={{ scale: 1, opacity: 0 }}
              animate={{ scale: [1, 2.2, 1], opacity: [0.2, 0, 0.2] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
            />
          )}
        </AnimatePresence>

        {/* Third pulse for speaking */}
        <AnimatePresence>
          {state === "speaking" && (
            <motion.div
              className={`absolute inset-0 rounded-full bg-emerald-400/20`}
              initial={{ scale: 1, opacity: 0 }}
              animate={{ scale: [1, 1.8, 1], opacity: [0.3, 0, 0.3] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, repeat: Infinity, delay: 0.3 }}
            />
          )}
        </AnimatePresence>

        {/* Inner gradient shine */}
        <div
          className="absolute inset-0 rounded-full opacity-30"
          style={{
            background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3) 0%, transparent 60%)",
          }}
        />

        {/* Icon */}
        {IconComponent}

        {/* Waveform visualization */}
        {(state === "listening" || state === "speaking") && (
          <WaveformBars
            active={true}
            color={state === "listening" ? "bg-red-400" : "bg-emerald-400"}
          />
        )}
      </motion.button>

      {/* Label */}
      {showLabel && (
        <AnimatePresence mode="wait">
          <motion.span
            key={state}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="text-xs text-white/50 font-medium"
          >
            {config.label}
          </motion.span>
        </AnimatePresence>
      )}
    </div>
  );
}
