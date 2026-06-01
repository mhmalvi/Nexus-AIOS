
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Cpu, Brain, Zap, Activity } from "lucide-react";
import { kernelApi } from "../../services/tauriApi";

export function DashboardWidget() {
    const [stats, setStats] = useState<any>(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await kernelApi.getModelStats();
                setStats(data);
            } catch (e) {
                // ignore
            }
        };
        fetchStats();
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
    }, []);

    if (!stats || !stats.llm_routing_enabled) return null;

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute top-20 right-6 w-64 glass-panel p-4 rounded-xl border border-white/10 z-10 pointer-events-auto"
        >
            <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
                <Brain className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-bold text-foreground">Active Neural Link</h3>
                <div className="ml-auto w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            </div>

            <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                        <Cpu className="w-3 h-3" /> Model
                    </span>
                    <span className="font-mono text-purple-300">{stats.default_model?.split(':')[0]}</span>
                </div>

                <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Routing Profile</span>
                    <div className="grid grid-cols-2 gap-2">
                        {stats.profiles && Object.entries(stats.profiles).map(([key, p]: [string, any]) => (
                            <div key={key} className="bg-white/5 rounded px-2 py-1.5 flex flex-col gap-0.5" title={p.purpose}>
                                <span className="text-[9px] uppercase text-muted-foreground flex items-center gap-1">
                                    {key === 'fast' ? <Zap className="w-2 h-2 text-yellow-500" /> : <Activity className="w-2 h-2 text-blue-500" />}
                                    {key}
                                </span>
                                <span className="text-[9px] truncate opacity-80">{p.model}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
