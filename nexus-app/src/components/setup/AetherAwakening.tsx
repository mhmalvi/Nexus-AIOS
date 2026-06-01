
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AetherAwakeningProps {
    onComplete: () => void;
}

const BOOT_STEPS = [
    { label: 'Neural Core', status: 'READY' },
    { label: 'Swarm Cluster', status: 'ONLINE' },
    { label: 'Memory Graph', status: 'SYNCED' },
    { label: 'Security Layer', status: 'ARMED' },
    { label: 'Interface Shell', status: 'LOADED' },
];

export const AetherAwakening: React.FC<AetherAwakeningProps> = ({ onComplete }) => {
    const [phase, setPhase] = useState<'core' | 'systems' | 'reveal' | 'done'>('core');
    const [stepIndex, setStepIndex] = useState(0);
    const [brandOpacity, setBrandOpacity] = useState(0);

    useEffect(() => {
        // Phase 1: Brand reveal (0–600ms)
        const t1 = setTimeout(() => setBrandOpacity(1), 100);

        // Phase 2: Systems check (600–1400ms) — 100ms per step
        const t2 = setTimeout(() => setPhase('systems'), 600);

        // Step through boot items
        const stepTimers: ReturnType<typeof setTimeout>[] = [];
        BOOT_STEPS.forEach((_, i) => {
            stepTimers.push(setTimeout(() => setStepIndex(i + 1), 700 + i * 100));
        });

        // Phase 3: Reveal (1300ms)
        const t3 = setTimeout(() => setPhase('reveal'), 1300);

        // Phase 4: Complete (1800ms total)
        const t4 = setTimeout(() => {
            setPhase('done');
            onComplete();
        }, 1800);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
            clearTimeout(t4);
            stepTimers.forEach(clearTimeout);
        };
    }, [onComplete]);

    return (
        <AnimatePresence>
            {phase !== 'done' && (
                <motion.div
                    key="awakening"
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="fixed inset-0 z-[9999] bg-[#030306] flex flex-col items-center justify-center overflow-hidden"
                >
                    {/* Deep ambient background */}
                    <div className="absolute inset-0">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_50%_45%,rgba(0,180,255,0.04),transparent_70%)]" />
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.05 }}
                            transition={{ duration: 1 }}
                            className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_50%,rgba(120,80,255,0.06),transparent)]"
                        />
                    </div>

                    {/* Central content */}
                    <div className="relative z-10 flex flex-col items-center gap-8">

                        {/* Core pulse — the singularity */}
                        <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{
                                scale: phase === 'reveal' ? [1, 1.5] : [0.8, 1.1, 0.8],
                                opacity: phase === 'reveal' ? [1, 0] : [0.6, 1, 0.6],
                            }}
                            transition={phase === 'reveal'
                                ? { duration: 0.5 }
                                : { duration: 2, repeat: Infinity, ease: 'easeInOut' }
                            }
                            className="relative"
                        >
                            <div className="w-3 h-3 bg-white rounded-full" />
                            <div className="absolute inset-0 w-3 h-3 bg-white rounded-full blur-md" />
                            <motion.div
                                className="absolute -inset-8 rounded-full blur-2xl"
                                style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.3), transparent 70%)' }}
                                animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
                                transition={{ duration: 2, repeat: Infinity }}
                            />
                        </motion.div>

                        {/* Brand text */}
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: brandOpacity, y: 0 }}
                            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                            className="flex flex-col items-center gap-2"
                        >
                            <h1 className="text-[28px] font-extralight tracking-[0.4em] text-white/90">
                                AETHER
                            </h1>
                            <div className="text-[9px] tracking-[0.35em] text-white/20 uppercase font-medium">
                                Autonomous Intelligence Operating System
                            </div>
                        </motion.div>

                        {/* Boot steps */}
                        <AnimatePresence>
                            {phase === 'systems' && (
                                <motion.div
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex flex-col items-center gap-1 font-mono text-[9px]"
                                >
                                    {BOOT_STEPS.slice(0, stepIndex).map((step, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, x: -6 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: 0.08 }}
                                            className="flex items-center gap-2 text-white/25"
                                        >
                                            <span className="w-24 text-right">{step.label}</span>
                                            <span className="w-1 h-1 rounded-full bg-green-400/50" />
                                            <span className="text-green-400/40 text-[8px]">{step.status}</span>
                                        </motion.div>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Progress line */}
                        <div className="w-24 h-[1px] bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-gradient-to-r from-transparent via-white/40 to-transparent"
                                initial={{ x: '-100%' }}
                                animate={phase === 'reveal' ? { x: '100%', opacity: 0 } : { x: ['−100%', '200%'] }}
                                transition={phase === 'reveal'
                                    ? { duration: 0.3 }
                                    : { duration: 1.2, repeat: Infinity, ease: 'linear' }
                                }
                            />
                        </div>
                    </div>

                    {/* Flash on reveal */}
                    <AnimatePresence>
                        {phase === 'reveal' && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: [0, 0.15, 0] }}
                                transition={{ duration: 0.5 }}
                                className="absolute inset-0 bg-white pointer-events-none"
                            />
                        )}
                    </AnimatePresence>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
