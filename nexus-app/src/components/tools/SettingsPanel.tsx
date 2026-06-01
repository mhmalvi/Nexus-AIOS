
import React, { useState } from 'react';
import { useStore } from '../../context/StoreContext';
import {
    Monitor, Mic, Volume2, Shield, Wifi, Cpu,
    Palette, Type, Battery, HardDrive, Bell, Eye,
    RefreshCw, Terminal, Lock, Activity, Brain, Database, Zap, Layers
} from 'lucide-react';
import { Button } from '../ui/Button';

import tauriApi from '../../services/tauriApi';

export function SettingsPanel() {
    const { ui, setAccentColor, setVoiceSettings, setTheme } = useStore();
    const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'voice' | 'network' | 'ai'>('general');
    const [sysInfo, setSysInfo] = useState({ kernel: 'Loading...', uptime: '0m', memory: '0%', storage: '0%' });
    const [aiStats, setAiStats] = useState<any>(null);
    const [models, setModels] = useState<string[]>([]);
    const [activeModel, setActiveModel] = useState<string>('');

    React.useEffect(() => {
        if (activeTab === 'general') {
            const fetchInfo = async () => {
                const info = await tauriApi.system.getSystemInfo();
                setSysInfo({
                    kernel: `Nexus-v${info.kernel_version || 'Generic'}`,
                    uptime: `${Math.floor((info.uptime || 0) / 3600)}h ${Math.floor(((info.uptime || 0) % 3600) / 60)}m`,
                    memory: `${Math.round(((info.used_memory || 0) / (info.total_memory || 1)) * 100)}%`,
                    storage: '45%' // Mock storage for now
                });
            };
            fetchInfo();
            const interval = setInterval(fetchInfo, 5000);
            return () => clearInterval(interval);
        } else if (activeTab === 'ai') {
            const fetchAiParams = async () => {
                try {
                    const stats = await tauriApi.kernel.getModelStats();
                    setAiStats(stats);

                    // Fetch available models
                    const modelList = await tauriApi.kernel.listModels();
                    setModels(modelList);
                    if (stats.default_model) setActiveModel(stats.default_model);
                } catch (e) {
                    console.error("Failed to fetch AI stats", e);
                }
            };
            fetchAiParams();
            const interval = setInterval(fetchAiParams, 5000); // Live updates
            return () => clearInterval(interval);
        }
    }, [activeTab]);

    const handleResetKernel = async () => {
        try {
            await tauriApi.kernel.stop();
            setTimeout(async () => {
                await tauriApi.kernel.start();
            }, 1000);
        } catch (e) {
            console.error("Reset failed", e);
        }
    };

    const colors = [
        { name: 'Electric Blue', value: '#007AFF' },
        { name: 'Neon Purple', value: '#BF5AF2' },
        { name: 'Cyber Green', value: '#32D74B' },
        { name: 'Alert Orange', value: '#FF9F0A' },
        { name: 'Crimson Red', value: '#FF3B30' },
        { name: 'Mono', value: '#71717a' },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'general':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="bg-card/40 border border-border rounded-xl p-4 space-y-4">
                            <h3 className="text-sm font-bold flex items-center gap-2"><Cpu className="w-4 h-4" /> System Info</h3>
                            <div className="grid grid-cols-2 gap-4 text-xs">
                                <div className="p-3 bg-background/50 rounded-lg border border-border/50">
                                    <div className="text-muted-foreground mb-1">Kernel Version</div>
                                    <div className="font-mono">{sysInfo.kernel}</div>
                                </div>
                                <div className="p-3 bg-background/50 rounded-lg border border-border/50">
                                    <div className="text-muted-foreground mb-1">Uptime</div>
                                    <div className="font-mono">{sysInfo.uptime}</div>
                                </div>
                                <div className="p-3 bg-background/50 rounded-lg border border-border/50">
                                    <div className="text-muted-foreground mb-1">Memory</div>
                                    <div className="font-mono flex items-center gap-2">
                                        <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                                            <div className="h-full bg-primary" style={{ width: sysInfo.memory }} />
                                        </div>
                                        <span>{sysInfo.memory}</span>
                                    </div>
                                </div>
                                <div className="p-3 bg-background/50 rounded-lg border border-border/50">
                                    <div className="text-muted-foreground mb-1">Storage</div>
                                    <div className="font-mono flex items-center gap-2">
                                        <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                                            <div className="h-full bg-green-500 w-[12%]" />
                                        </div>
                                        <span>12%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-card/40 border border-border rounded-xl p-4 space-y-4">
                            <h3 className="text-sm font-bold flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Updates</h3>
                            <div className="flex items-center justify-between">
                                <div className="text-xs text-muted-foreground">Last checked: 2 minutes ago</div>
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-2">
                                    <RefreshCw className="w-3 h-3" /> Check Now
                                </Button>
                            </div>
                        </div>
                    </div>
                );
            case 'appearance':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="bg-card/40 border border-border rounded-xl p-4 space-y-6">
                            <div className="space-y-3">
                                <label className="text-sm font-medium flex items-center gap-2"><Palette className="w-4 h-4" /> Interface Theme</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['light', 'dark', 'system'].map((t) => (
                                        <button
                                            key={t}
                                            onClick={() => setTheme(t as any)}
                                            className={`px-3 py-2 rounded-lg text-xs capitalize border transition-all ${ui.theme === t ? 'bg-primary/10 border-primary text-primary' : 'bg-background/50 border-border hover:bg-muted'}`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3 pt-4 border-t border-border/50">
                                <label className="text-sm font-medium flex items-center gap-2"><Type className="w-4 h-4" /> Accent Color</label>
                                <div className="flex flex-wrap gap-3">
                                    {colors.map((c) => (
                                        <button
                                            key={c.value}
                                            onClick={() => setAccentColor(c.value)}
                                            className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${ui.accentColor === c.value ? 'border-foreground scale-110 shadow-lg' : 'border-transparent'}`}
                                            style={{ backgroundColor: c.value }}
                                            title={c.name}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3 pt-4 border-t border-border/50">
                                <label className="text-sm font-medium flex items-center gap-2"><Eye className="w-4 h-4" /> Visual Effects</label>
                                <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-border/50">
                                    <span className="text-xs">Reduce Motion</span>
                                    <div className="w-8 h-4 bg-muted rounded-full relative cursor-pointer">
                                        <div className="absolute left-1 top-1 w-2 h-2 bg-muted-foreground/50 rounded-full transition-all" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-border/50">
                                    <span className="text-xs">Glass Blur</span>
                                    <div className="w-8 h-4 bg-primary rounded-full relative cursor-pointer">
                                        <div className="absolute right-1 top-1 w-2 h-2 bg-white rounded-full transition-all" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case 'voice':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="bg-card/40 border border-border rounded-xl p-4 space-y-6">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-medium flex items-center gap-2"><Mic className="w-4 h-4" /> Input Sensitivity</label>
                                    <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{(ui.voiceSettings?.sensitivity || 1).toFixed(1)}x</span>
                                </div>
                                <input
                                    type="range" min="0.1" max="2.0" step="0.1"
                                    value={ui.voiceSettings?.sensitivity || 1}
                                    onChange={(e) => setVoiceSettings({ sensitivity: parseFloat(e.target.value) })}
                                    className="w-full accent-primary h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
                                />
                            </div>

                            <div className="space-y-4 pt-4 border-t border-border/50">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-medium flex items-center gap-2"><Activity className="w-4 h-4" /> Visualizer Smoothing</label>
                                    <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{(ui.voiceSettings?.responsiveness || 0.5).toFixed(1)}</span>
                                </div>
                                <input
                                    type="range" min="0.1" max="1.0" step="0.1"
                                    value={ui.voiceSettings?.responsiveness || 0.5}
                                    onChange={(e) => setVoiceSettings({ responsiveness: parseFloat(e.target.value) })}
                                    className="w-full accent-primary h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
                                />
                            </div>

                            <div className="space-y-3 pt-4 border-t border-border/50">
                                <label className="text-sm font-medium flex items-center gap-2"><Palette className="w-4 h-4" /> Visualizer Style</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['primary', 'rainbow', 'monochrome'].map((mode) => (
                                        <button
                                            key={mode}
                                            onClick={() => setVoiceSettings({ visualizerColor: mode as any })}
                                            className={`px-3 py-2 rounded-lg text-xs capitalize border transition-all text-center
                                                ${ui.voiceSettings?.visualizerColor === mode ? 'bg-primary/10 border-primary text-primary' : 'bg-background/50 border-border hover:bg-muted'}
                                            `}
                                        >
                                            {mode}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case 'ai':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="bg-card/40 border border-border rounded-xl p-4 space-y-4">
                            <h3 className="text-sm font-bold flex items-center gap-2"><Brain className="w-4 h-4" /> Multi-Model Routing</h3>

                            {/* Model Selector */}
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">Active Model Provider</label>
                                <select
                                    value={activeModel}
                                    onChange={async (e) => {
                                        const newVal = e.target.value;
                                        setActiveModel(newVal);
                                        await tauriApi.kernel.setModel(newVal);
                                        // Force refresh stats
                                        const stats = await tauriApi.kernel.getModelStats();
                                        setAiStats(stats);
                                    }}
                                    className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary transition-all"
                                >
                                    {models.length > 0 ? (
                                        models.map(m => <option key={m} value={m}>{m}</option>)
                                    ) : (
                                        <option value={activeModel || "loading"}>{activeModel || "Loading models..."}</option>
                                    )}
                                </select>
                            </div>

                            <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${aiStats?.llm_routing_enabled ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                                    <span className="text-xs font-medium">Smart Routing Engine</span>
                                </div>
                                <span className="text-[10px] font-mono opacity-70">
                                    {aiStats?.llm_routing_enabled ? 'ACTIVE' : 'DISABLED'}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                {aiStats && Object.entries(aiStats.profiles || {}).map(([key, profile]: [string, any]) => (
                                    <div key={key} className="p-3 bg-background/50 rounded-lg border border-border/50 flex flex-col gap-2">
                                        <div className="flex justify-between items-center border-b border-border/30 pb-2">
                                            <span className="text-xs font-bold capitalize flex items-center gap-2">
                                                {key === 'routing' && <Zap className="w-3 h-3 text-yellow-500" />}
                                                {key === 'fast' && <Activity className="w-3 h-3 text-blue-500" />}
                                                {key === 'capable' && <Brain className="w-3 h-3 text-purple-500" />}
                                                {key === 'embedding' && <Database className="w-3 h-3 text-green-500" />}
                                                {key} Priority
                                            </span>
                                            <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full font-mono">{profile.model || aiStats.default_model}</span>
                                        </div>
                                        <div className="flex justify-between text-[10px] text-muted-foreground">
                                            <span>Speed: {profile.speed}/10</span>
                                            <span>Cap: {profile.capability}/10</span>
                                        </div>
                                        <div className="text-[10px] opacity-70 italic truncate">
                                            {profile.purpose}
                                        </div>
                                    </div>
                                ))}
                                {!aiStats && <div className="text-center py-4 text-xs text-muted-foreground">Connecting to Neural Link...</div>}
                            </div>
                        </div>

                        <div className="bg-card/40 border border-border rounded-xl p-4 space-y-4">
                            <h3 className="text-sm font-bold flex items-center gap-2"><Layers className="w-4 h-4" /> Knowledge Base</h3>
                            <div className="p-3 bg-background/50 rounded-lg border border-border/50 flex justify-between items-center">
                                <div className="flex flex-col">
                                    <span className="text-xs font-medium">Memory Tier 3 (RAG)</span>
                                    <span className="text-[10px] text-muted-foreground">Vector Database Active</span>
                                </div>
                                <span className="text-[10px] bg-green-500/10 text-green-500 border border-green-500/20 px-2 py-0.5 rounded-full">Connected</span>
                            </div>
                        </div>
                    </div>
                );
            case 'network':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="bg-card/40 border border-border rounded-xl p-4 space-y-4">
                            <h3 className="text-sm font-bold flex items-center gap-2"><Shield className="w-4 h-4" /> Security Layer</h3>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <Lock className="w-4 h-4 text-green-500" />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-green-600">eBPF Firewall</span>
                                            <span className="text-[10px] text-green-600/70">Active Monitoring</span>
                                        </div>
                                    </div>
                                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                </div>

                                <div className="flex items-center justify-between p-3 bg-background/50 border border-border/50 rounded-lg opacity-75">
                                    <div className="flex items-center gap-3">
                                        <Wifi className="w-4 h-4 text-muted-foreground" />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold">Quantum Tunnel</span>
                                            <span className="text-[10px] text-muted-foreground">Standby</span>
                                        </div>
                                    </div>
                                    <Button size="sm" variant="ghost" className="h-6 text-[10px]">Enable</Button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="flex h-full bg-background/50 font-sans">
            {/* Sidebar */}
            <div className="w-48 bg-muted/10 border-r border-border/50 p-3 space-y-1">
                {[
                    { id: 'general', icon: Monitor, label: 'General' },
                    { id: 'ai', icon: Brain, label: 'AI Models' },
                    { id: 'appearance', icon: Palette, label: 'Appearance' },
                    { id: 'voice', icon: Mic, label: 'Voice & Audio' },
                    { id: 'network', icon: Wifi, label: 'Network' },
                ].map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id as any)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all
                        ${activeTab === item.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}
                    `}
                    >
                        <item.icon className="w-4 h-4" />
                        {item.label}
                    </button>
                ))}

                <div className="pt-4 mt-4 border-t border-border/50">
                    <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 transition-all">
                        <Terminal className="w-4 h-4" />
                        Reset Kernel
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-xl mx-auto">
                    <h2 className="text-lg font-bold mb-6 capitalize">{activeTab} Settings</h2>
                    {renderContent()}
                </div>
            </div>
        </div>
    );
}
