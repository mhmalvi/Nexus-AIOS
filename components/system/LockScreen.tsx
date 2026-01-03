
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Fingerprint, Lock, Unlock, ChevronRight, User, Aperture } from 'lucide-react';
import { useStore } from '../../context/StoreContext';

export function LockScreen() {
    const { ui, setLocked } = useStore();
    const [scanState, setScanState] = useState<'idle' | 'scanning' | 'success' | 'failed'>('idle');
    const [password, setPassword] = useState('');
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const handleUnlock = () => {
        setScanState('scanning');
        setTimeout(() => {
            setScanState('success');
            setTimeout(() => {
                setLocked(false);
            }, 800);
        }, 1500);
    };

    const handlePasswordSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length > 0) handleUnlock();
    };

    if (!ui.isLocked) return null;

    return (
        <div className="fixed inset-0 z-[9999] bg-black text-white flex flex-col items-center justify-center overflow-hidden">
            {/* Ambient Background */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black opacity-80" />
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10" />
            
            {/* Scanning Line */}
            <AnimatePresence>
                {scanState === 'scanning' && (
                    <motion.div 
                        initial={{ top: '-10%' }}
                        animate={{ top: '110%' }}
                        transition={{ duration: 1.5, ease: "linear", repeat: Infinity }}
                        className="absolute left-0 right-0 h-1 bg-primary shadow-[0_0_20px_rgba(var(--primary),0.8)] z-0"
                    />
                )}
            </AnimatePresence>

            <div className="relative z-10 flex flex-col items-center gap-12 w-full max-w-md">
                
                {/* Clock */}
                <div className="flex flex-col items-center gap-2">
                    <h1 className="text-6xl font-light tracking-tighter tabular-nums">
                        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </h1>
                    <p className="text-sm font-medium tracking-widest uppercase text-white/50">
                        {time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>
                </div>

                {/* Avatar / Biometric */}
                <div className="relative group">
                    <motion.button 
                        onClick={handleUnlock}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`w-32 h-32 rounded-full border-2 flex items-center justify-center relative overflow-hidden transition-colors duration-500
                            ${scanState === 'idle' ? 'border-white/10 bg-white/5 hover:border-primary/50' : ''}
                            ${scanState === 'scanning' ? 'border-primary bg-primary/10' : ''}
                            ${scanState === 'success' ? 'border-green-500 bg-green-500/10' : ''}
                        `}
                    >
                        {scanState === 'idle' && <Fingerprint className="w-16 h-16 text-white/50 group-hover:text-primary transition-colors" />}
                        {scanState === 'scanning' && <Aperture className="w-16 h-16 text-primary animate-spin-slow" />}
                        {scanState === 'success' && <Unlock className="w-16 h-16 text-green-500" />}
                    </motion.button>
                    
                    {/* Ripple Ring */}
                    {scanState === 'idle' && (
                        <div className="absolute inset-0 rounded-full border border-white/5 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" />
                    )}
                </div>

                {/* Password Input */}
                <form onSubmit={handlePasswordSubmit} className="w-full px-8">
                    <div className="relative group">
                        <input 
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter Passcode"
                            className="w-full bg-white/5 border border-white/10 rounded-full py-3 px-6 text-center text-sm tracking-[0.5em] focus:outline-none focus:border-primary/50 focus:bg-white/10 transition-all placeholder:tracking-normal placeholder:text-white/20"
                            autoFocus
                        />
                        <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </form>

                {/* Footer Status */}
                <div className="flex items-center gap-2 text-[10px] text-white/30 uppercase tracking-widest">
                    <Lock className="w-3 h-3" />
                    <span>System Locked • Neural Link Active</span>
                </div>
            </div>
        </div>
    );
}
