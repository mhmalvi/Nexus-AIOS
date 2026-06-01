
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, ChevronRight, Shield, Globe, Terminal, Loader2, Code, AudioWaveform } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { Agent } from '../../types';

interface OnboardingProps {
    onComplete: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const { updateAgentStatus } = useStore();
    const [step, setStep] = useState(0);
    const [name, setName] = useState('');
    const [role, setRole] = useState('Developer');
    const [loading, setLoading] = useState(false);

    const handleComplete = async () => {
        setLoading(true);
        // Simulate profile creation / kernel handshake
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Save to local storage
        try {
            localStorage.setItem('nexus_user_name', name);
            localStorage.setItem('nexus_user_role', role);
            localStorage.setItem('nexus_setup_complete', 'true');
        } catch (e) { }

        // Update manager status to reflect new user
        updateAgentStatus('manager', {
            currentTask: `Initializing session for ${role} ${name}...`,
            status: 'thinking'
        });

        setLoading(false);
        onComplete();
    };

    const steps = [
        // Step 0: Identity
        <div className="space-y-6">
            <div className="space-y-2">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                    Welcome to Nexus
                </h1>
                <p className="text-zinc-400">Initialize your neural workspace identity.</p>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Designation</label>
                    <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter your name"
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                            autoFocus
                        />
                    </div>
                </div>
            </div>

            <div className="flex justify-end pt-4">
                <button
                    onClick={() => setStep(1)}
                    disabled={!name.trim()}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-full font-medium transition-all"
                >
                    Continue <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>,

        // Step 1: Role Selection
        <div className="space-y-6">
            <div className="space-y-2">
                <h1 className="text-2xl font-bold text-white">Select Your Role</h1>
                <p className="text-zinc-400">This optimizes the swarm for your primary objectives.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {[
                    { id: 'Developer', icon: Code, desc: 'Optimized for coding & architecture' },
                    { id: 'Researcher', icon: Globe, desc: 'Enhanced web search & synthesis' },
                    { id: 'SecOps', icon: Shield, desc: 'Focus on security & monitoring' },
                    { id: 'Operator', icon: Terminal, desc: 'Full system control & automation' }
                ].map((r) => (
                    <button
                        key={r.id}
                        onClick={() => setRole(r.id)}
                        className={`p-4 rounded-xl border text-left transition-all ${role === r.id
                                ? 'bg-blue-500/10 border-blue-500/50 ring-1 ring-blue-500/50'
                                : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                            }`}
                    >
                        <r.icon className={`w-6 h-6 mb-3 ${role === r.id ? 'text-blue-400' : 'text-zinc-500'}`} />
                        <div className={`font-bold ${role === r.id ? 'text-white' : 'text-zinc-300'}`}>{r.id}</div>
                        <div className="text-[10px] text-zinc-500 mt-1">{r.desc}</div>
                    </button>
                ))}
            </div>

            <div className="flex justify-between pt-4">
                <button
                    onClick={() => setStep(0)}
                    className="text-zinc-500 hover:text-white px-4 py-2 transition-colors"
                >
                    Back
                </button>
                <button
                    onClick={handleComplete}
                    disabled={loading}
                    className="flex items-center gap-2 bg-white text-black hover:bg-zinc-200 px-8 py-2.5 rounded-full font-bold transition-all"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Initialize Nexus'}
                </button>
            </div>
        </div>
    ];

    return (
        <div className="fixed inset-0 z-50 bg-[#09090b] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 relative overflow-hidden shadow-2xl"
            >
                {/* Progress Bar */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-white/5">
                    <motion.div
                        className="h-full bg-blue-500"
                        initial={{ width: '0%' }}
                        animate={{ width: step === 0 ? '50%' : '100%' }}
                    />
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                    >
                        {steps[step]}
                    </motion.div>
                </AnimatePresence>
            </motion.div>
        </div>
    );
};
