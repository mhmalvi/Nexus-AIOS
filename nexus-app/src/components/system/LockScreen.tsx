
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Fingerprint, Unlock, ChevronUp } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { AetherPulse } from '../ui/AetherPulse';

type BootPhase = 'boot' | 'ready' | 'unlocking' | 'dismissed';

const BOOT_LINES = [
    'AETHER Neural Core ................ OK',
    'Swarm Cluster v3.2 ................ ONLINE',
    'Memory Subsystem .................. SYNCED',
    'Security Layer .................... ARMED',
];

export function LockScreen() {
    const { ui, setLocked } = useStore();
    const [phase, setPhase] = useState<BootPhase>('boot');
    const [bootIndex, setBootIndex] = useState(0);
    const [time, setTime] = useState(new Date());

    // Clock
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Fast boot sequence — 80ms per line, then ready
    useEffect(() => {
        if (!ui.isLocked) return;
        setPhase('boot');
        setBootIndex(0);

        let idx = 0;
        const bootTimer = setInterval(() => {
            idx++;
            setBootIndex(idx);
            if (idx >= BOOT_LINES.length) {
                clearInterval(bootTimer);
                setTimeout(() => setPhase('ready'), 150);
            }
        }, 80);

        return () => clearInterval(bootTimer);
    }, [ui.isLocked]);

    // Unlock handler — fast 400ms transition
    const handleUnlock = useCallback(() => {
        if (phase !== 'ready') return;
        setPhase('unlocking');
        setTimeout(() => {
            setPhase('dismissed');
            setTimeout(() => setLocked(false), 200);
        }, 400);
    }, [phase, setLocked]);

    // Keyboard: any key or Enter unlocks
    useEffect(() => {
        if (phase !== 'ready') return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') handleUnlock();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [phase, handleUnlock]);

    if (!ui.isLocked) return null;

    return (
        <AnimatePresence>
            {phase !== 'dismissed' && (
                <motion.div
                    key="lockscreen"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 1.02 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className="fixed inset-0 z-[9999] text-white flex flex-col items-center justify-center overflow-hidden cursor-pointer select-none"
                    onClick={handleUnlock}
                >
                    {/* Deep black background with subtle brand gradient */}
                    <div className="absolute inset-0 bg-[#050508]" />
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_40%,hsl(var(--primary)/0.08),transparent_70%)]" />
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_60%_at_30%_70%,rgba(100,100,255,0.03),transparent)]" />

                    {/* Noise overlay */}
                    <div className="absolute inset-0 opacity-[0.03]"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
                    />

                    {/* Content */}
                    <div className="relative z-10 flex flex-col items-center w-full max-w-md px-8">

                        {/* Boot Sequence */}
                        <AnimatePresence mode="wait">
                            {phase === 'boot' && (
                                <motion.div
                                    key="boot"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex flex-col items-center gap-6"
                                >
                                    {/* Brand mark */}
                                    <div className="flex items-center gap-3 mb-2">
                                        <AetherPulse state="thinking" size={20} />
                                        <span className="text-[13px] font-bold tracking-[0.25em] text-white/60">AETHER OS</span>
                                    </div>

                                    {/* Boot log */}
                                    <div className="font-mono text-[10px] text-white/30 space-y-0.5 w-64">
                                        {BOOT_LINES.slice(0, bootIndex).map((line, i) => (
                                            <motion.div
                                                key={i}
                                                initial={{ opacity: 0, x: -8 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ duration: 0.1 }}
                                                className="flex justify-between"
                                            >
                                                <span>{line.split('...')[0]}</span>
                                                <span className="text-green-400/60">
                                                    {line.includes('OK') ? '✓' : line.includes('ONLINE') ? '●' : line.includes('SYNCED') ? '◆' : '◈'}
                                                </span>
                                            </motion.div>
                                        ))}
                                    </div>

                                    {/* Progress bar */}
                                    <div className="w-32 h-[2px] bg-white/5 rounded-full overflow-hidden">
                                        <motion.div
                                            className="h-full bg-gradient-to-r from-primary/60 to-primary"
                                            initial={{ width: '0%' }}
                                            animate={{ width: `${(bootIndex / BOOT_LINES.length) * 100}%` }}
                                            transition={{ duration: 0.08 }}
                                        />
                                    </div>
                                </motion.div>
                            )}

                            {/* Ready State — Clock + Unlock */}
                            {(phase === 'ready' || phase === 'unlocking') && (
                                <motion.div
                                    key="ready"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -40, scale: 0.95 }}
                                    transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                                    className="flex flex-col items-center gap-10"
                                >
                                    {/* Clock */}
                                    <div className="flex flex-col items-center gap-1.5">
                                        <h1 className="text-7xl font-extralight tracking-[-0.02em] tabular-nums text-white/95"
                                            style={{ fontFeatureSettings: '"tnum"' }}>
                                            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                        </h1>
                                        <p className="text-[11px] font-medium tracking-[0.2em] uppercase text-white/30">
                                            {time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                                        </p>
                                    </div>

                                    {/* Unlock area */}
                                    <div className="flex flex-col items-center gap-5">
                                        {/* Biometric button */}
                                        <motion.div
                                            className="relative"
                                            animate={phase === 'unlocking' ? { scale: [1, 1.1, 0.9], opacity: [1, 0.5, 0] } : {}}
                                            transition={{ duration: 0.4 }}
                                        >
                                            <motion.button
                                                onClick={(e) => { e.stopPropagation(); handleUnlock(); }}
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.92 }}
                                                className="w-20 h-20 rounded-full border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm flex items-center justify-center group transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                                            >
                                                {phase === 'unlocking'
                                                    ? <Unlock className="w-8 h-8 text-primary" />
                                                    : <Fingerprint className="w-8 h-8 text-white/25 group-hover:text-white/60 transition-colors" />
                                                }
                                            </motion.button>

                                            {/* Subtle ring pulse */}
                                            <motion.div
                                                animate={{ scale: [1, 1.8], opacity: [0.15, 0] }}
                                                transition={{ duration: 3, repeat: Infinity, ease: 'easeOut' }}
                                                className="absolute inset-0 rounded-full border border-white/10"
                                            />
                                        </motion.div>

                                        {/* Hint */}
                                        <motion.div
                                            animate={{ y: [0, -4, 0] }}
                                            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                                            className="flex flex-col items-center gap-1"
                                        >
                                            <ChevronUp className="w-4 h-4 text-white/15" />
                                            <span className="text-[10px] tracking-[0.15em] text-white/20 uppercase">
                                                Click or press Enter
                                            </span>
                                        </motion.div>
                                    </div>

                                    {/* Brand footer */}
                                    <div className="flex items-center gap-2 mt-4">
                                        <AetherPulse state="idle" size={10} />
                                        <span className="text-[9px] tracking-[0.3em] text-white/15 uppercase font-medium">
                                            AETHER OS • Neural Link Active
                                        </span>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
