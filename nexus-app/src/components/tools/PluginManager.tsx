
import React, { useState, useEffect } from "react";
import { Puzzle, RefreshCw, Power, PowerOff, RotateCcw, Shield, AlertTriangle, CheckCircle2, XCircle, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { pluginApi } from "../../services/tauriApi";

interface PluginInfo {
    name: string;
    version: string;
    description: string;
    author: string;
    state: string;
    permissions: string[];
}

const STATE_CONFIG: Record<string, { color: string; bg: string; icon: any }> = {
    running: { color: 'text-green-500', bg: 'bg-green-500/10', icon: CheckCircle2 },
    initialized: { color: 'text-green-500', bg: 'bg-green-500/10', icon: CheckCircle2 },
    discovered: { color: 'text-blue-500', bg: 'bg-blue-500/10', icon: Puzzle },
    stopped: { color: 'text-zinc-500', bg: 'bg-zinc-500/10', icon: PowerOff },
    error: { color: 'text-red-500', bg: 'bg-red-500/10', icon: XCircle },
};

export function PluginManager() {
    const [plugins, setPlugins] = useState<PluginInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [systemStats, setSystemStats] = useState<{ total: number; loaded: number; errored: number }>({ total: 0, loaded: 0, errored: 0 });
    const [error, setError] = useState<string | null>(null);

    const fetchPlugins = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await pluginApi.list();
            if (res?.success && res?.data?.plugins) {
                setPlugins(res.data.plugins);
                setSystemStats({
                    total: res.data.total || res.data.plugins.length,
                    loaded: res.data.loaded || 0,
                    errored: res.data.errored || 0,
                });
            } else if (res?.error) {
                setError(res.error);
            }
        } catch (e) {
            console.error("Failed to fetch plugins:", e);
            setError("Failed to communicate with kernel.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchPlugins(); }, []);

    const handleEnable = async (name: string) => {
        setActionLoading(name);
        try {
            await pluginApi.enable(name);
            await fetchPlugins();
        } finally {
            setActionLoading(null);
        }
    };

    const handleDisable = async (name: string) => {
        setActionLoading(name);
        try {
            await pluginApi.disable(name);
            await fetchPlugins();
        } finally {
            setActionLoading(null);
        }
    };

    const handleReload = async (name: string) => {
        setActionLoading(name);
        try {
            await pluginApi.reload(name);
            await fetchPlugins();
        } finally {
            setActionLoading(null);
        }
    };

    const isActive = (state: string) => state === 'running' || state === 'initialized';

    const filtered = searchQuery
        ? plugins.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.description.toLowerCase().includes(searchQuery.toLowerCase()))
        : plugins;

    return (
        <div className="flex h-full bg-background text-foreground overflow-hidden font-sans">
            {/* Left Sidebar */}
            <div className="w-56 border-r border-border/40 flex flex-col bg-card/30">
                <div className="p-4 border-b border-border/30">
                    <div className="flex items-center gap-2">
                        <Puzzle className="w-4 h-4 text-primary" />
                        <span className="text-xs font-bold uppercase tracking-widest text-foreground/80">Plugins</span>
                    </div>
                </div>

                {/* Search */}
                <div className="p-3 border-b border-border/30">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search plugins..."
                            className="w-full bg-input/50 border border-border rounded-xl pl-9 pr-3 py-2 text-[11px] placeholder-muted-foreground/50 focus:outline-none focus:border-primary/50"
                        />
                    </div>
                </div>

                {/* Stats */}
                <div className="flex-1" />
                <div className="p-4 border-t border-border/30 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-muted/30 rounded-lg p-2 text-center border border-border/20">
                            <p className="text-lg font-bold text-primary">{systemStats.total}</p>
                            <p className="text-[8px] uppercase tracking-widest text-muted-foreground">Total</p>
                        </div>
                        <div className="bg-green-500/10 rounded-lg p-2 text-center border border-green-500/20">
                            <p className="text-lg font-bold text-green-500">{systemStats.loaded}</p>
                            <p className="text-[8px] uppercase tracking-widest text-muted-foreground">Loaded</p>
                        </div>
                        <div className="bg-red-500/10 rounded-lg p-2 text-center border border-red-500/20">
                            <p className="text-lg font-bold text-red-500">{systemStats.errored}</p>
                            <p className="text-[8px] uppercase tracking-widest text-muted-foreground">Errors</p>
                        </div>
                    </div>
                    <button
                        onClick={fetchPlugins}
                        disabled={loading}
                        className="w-full px-3 py-2 rounded-xl text-[10px] font-medium bg-primary/10 hover:bg-primary/20 text-primary transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Main Content - Plugin Grid */}
            <div className="flex-1 overflow-y-auto p-5">
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-sm font-semibold">Installed Plugins</h2>
                    <span className="text-[10px] text-muted-foreground">{filtered.length} plugin{filtered.length !== 1 ? 's' : ''}</span>
                </div>

                {loading && (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                        <span className="text-xs">Loading plugins...</span>
                    </div>
                )}
                {error && (
                    <div className="flex items-center justify-center py-6">
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs text-center">
                            <AlertTriangle className="w-6 h-6 mx-auto mb-2 opacity-50" />
                            <p className="font-bold mb-1">Error Loading Plugins</p>
                            <p className="opacity-80">{error}</p>
                        </div>
                    </div>
                )}
                {!loading && !error && filtered.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                        <Puzzle className="w-10 h-10 mx-auto mb-3 opacity-20" />
                        <p className="text-sm">No plugins found.</p>
                        <p className="text-[10px] opacity-60 mt-1">Add plugins to the kernel/plugins directory.</p>
                    </div>
                )}

                <div className="space-y-3">
                    {filtered.map((plugin, i) => {
                        const stateConfig = STATE_CONFIG[plugin.state] || STATE_CONFIG.stopped;
                        const StateIcon = stateConfig.icon;
                        const active = isActive(plugin.state);

                        return (
                            <motion.div
                                key={plugin.name}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className={`${stateConfig.bg} border ${active ? 'border-green-500/20' : 'border-border/30'} rounded-xl p-4 transition-all`}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${stateConfig.bg}`}>
                                            <Puzzle className={`w-4 h-4 ${stateConfig.color}`} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-xs font-semibold">{plugin.name}</h3>
                                                <span className="text-[9px] text-muted-foreground font-mono">v{plugin.version}</span>
                                                <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] uppercase font-bold ${stateConfig.bg} ${stateConfig.color}`}>
                                                    <StateIcon className="w-2.5 h-2.5" />
                                                    {plugin.state}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">{plugin.description}</p>
                                            {plugin.author && (
                                                <p className="text-[9px] text-muted-foreground/60 mt-0.5">by {plugin.author}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        {active ? (
                                            <button
                                                onClick={() => handleDisable(plugin.name)}
                                                disabled={actionLoading === plugin.name}
                                                className="px-3 py-1.5 rounded-lg text-[10px] font-medium bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors flex items-center gap-1 disabled:opacity-50"
                                            >
                                                {actionLoading === plugin.name ? <RefreshCw className="w-3 h-3 animate-spin" /> : <PowerOff className="w-3 h-3" />}
                                                Disable
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleEnable(plugin.name)}
                                                disabled={actionLoading === plugin.name}
                                                className="px-3 py-1.5 rounded-lg text-[10px] font-medium bg-green-500/10 hover:bg-green-500/20 text-green-500 transition-colors flex items-center gap-1 disabled:opacity-50"
                                            >
                                                {actionLoading === plugin.name ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Power className="w-3 h-3" />}
                                                Enable
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleReload(plugin.name)}
                                            disabled={actionLoading === plugin.name}
                                            className="px-2 py-1.5 rounded-lg text-[10px] font-medium bg-muted/30 hover:bg-muted/50 text-muted-foreground transition-colors disabled:opacity-50"
                                            title="Reload plugin"
                                        >
                                            <RotateCcw className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>

                                {/* Permissions */}
                                {plugin.permissions.length > 0 && (
                                    <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/20">
                                        <Shield className="w-3 h-3 text-muted-foreground" />
                                        <span className="text-[9px] text-muted-foreground">Permissions:</span>
                                        {plugin.permissions.map(perm => (
                                            <span key={perm} className="px-1.5 py-0.5 rounded bg-muted/50 text-[8px] text-muted-foreground border border-border/30">
                                                {perm}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
