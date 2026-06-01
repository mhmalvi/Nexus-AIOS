
import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Cpu, Shield, Wifi, Check, Activity, FastForward } from 'lucide-react';
import { useSound } from '../../hooks/useSound';

interface BootSequenceProps {
    onComplete: () => void;
}

const BOOT_LOGS = [
    { text: "BIOS_CHECK... OK", delay: 200 },
    { text: "MOUNT_VFS_ROOT... OK", delay: 400 },
    { text: "INIT_NEURAL_ENGINE... 128 Cores Active", delay: 800 },
    { text: "LOAD_CONTEXT_VECTORS... 4096 dim", delay: 1100 },
    { text: "ESTABLISH_SECURE_Handshake... VERIFIED", delay: 1500 },
    { text: "STARTING_SWARM_AGENTS...", delay: 1900 },
    { text: "NEXUS_KERNEL_READY", delay: 2400 },
];

export function BootSequence({ onComplete }: BootSequenceProps) {
    const [logs, setLogs] = useState<string[]>([]);
    const [progress, setProgress] = useState(0);
    const { play } = useSound();
    const [isSkipping, setIsSkipping] = useState(false);

    const handleComplete = useCallback(() => {
        if (isSkipping) return;
        setIsSkipping(true);
        onComplete();
    }, [onComplete, isSkipping]);

    useEffect(() => {
        // Trigger boot sound immediately
        play('boot');

        let timeouts: ReturnType<typeof setTimeout>[] = [];

        // Progress bar simulation
        const progressInterval = setInterval(() => {
            setProgress(p => {
                if (p >= 100) {
                    clearInterval(progressInterval);
                    return 100;
                }
                return p + Math.random() * 5;
            });
        }, 100);

        // Log streaming
        BOOT_LOGS.forEach(({ text, delay }) => {
            const timeout = setTimeout(() => {
                setLogs(prev => [...prev, text]);
                play('typing');
            }, delay);
            timeouts.push(timeout);
        });

        // Completion
        const finishTimeout = setTimeout(() => {
            handleComplete();
        }, 3000);
        timeouts.push(finishTimeout);

        // Manual Skip Listener
        const handleKeyDown = () => handleComplete();
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            clearInterval(progressInterval);
            timeouts.forEach(clearTimeout);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleComplete, play]);

    return (
        <div 
            onClick={handleComplete}
            className="fixed inset-0 z-[9999] bg-black text-white font-mono flex flex-col items-center justify-center p-8 cursor-pointer select-none"
        >
            <div className="w-full max-w-lg space-y-8">
                
                {/* Logo / Header */}
                <div className="flex flex-col items-center gap-4 mb-12">
                    <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 1 }}
                        className="relative w-24 h-24 flex items-center justify-center"
                    >
                        <div className="absolute inset-0 border-4 border-t-primary border-r-transparent border-b-primary border-l-transparent rounded-full animate-spin" />
                        <div className="absolute inset-2 border-2 border-t-transparent border-r-white border-b-transparent border-l-white rounded-full animate-spin-slow opacity-50" />
                        <Cpu className="w-10 h-10 text-primary animate-pulse" />
                    </motion.div>
                    <motion.h1 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-2xl font-bold tracking-[0.5em] text-center"
                    >
                        NEXUS<span className="text-primary">OS</span>
                    </motion.h1>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                    <div className="flex justify-between text-xs text-zinc-500 uppercase tracking-widest">
                        <span>System Initialization</span>
                        <span>{Math.min(100, Math.floor(progress))}%</span>
                    </div>
                    <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                        <motion.div 
                            className="h-full bg-primary shadow-[0_0_15px_rgba(var(--primary),0.8)]"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                {/* Terminal Logs */}
                <div className="h-32 overflow-hidden flex flex-col justify-end text-xs text-zinc-400 space-y-1 border-l-2 border-zinc-800 pl-4">
                    {logs.map((log, i) => (
                        <motion.div 
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-2"
                        >
                            <span className="text-primary">➜</span>
                            {log}
                        </motion.div>
                    ))}
                </div>

                {/* Footer Metadata */}
                <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-8 text-[10px] text-zinc-600 uppercase tracking-widest">
                    <div className="flex items-center gap-2"><Shield className="w-3 h-3" /> Secure Boot</div>
                    <div className="flex items-center gap-2"><Activity className="w-3 h-3" /> Kernel v3.1.0</div>
                    <div className="flex items-center gap-2 animate-pulse text-zinc-500"><FastForward className="w-3 h-3" /> Press any key to skip</div>
                </div>
            </div>
        </div>
    );
}
