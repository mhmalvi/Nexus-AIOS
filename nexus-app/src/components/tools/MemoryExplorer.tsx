
import React, { useState, useEffect, useMemo } from "react";
import { Brain, Database, Layers, Search, Clock, Trash2, X, RefreshCw, Sparkles, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { memoryApi, kernelApi } from "../../services/tauriApi";

interface MemoryEntry {
    id: string;
    tier: 0 | 1 | 2 | 3;
    content: string;
    type: 'conversation' | 'knowledge' | 'qmd' | 'entity' | 'preference' | 'pattern';
    timestamp: string;
    score?: number;
    tags: string[];
    accessCount: number;
}

interface TierInfo {
    tier: number;
    name: string;
    subtitle: string;
    icon: any;
    color: string;
    bgColor: string;
    borderColor: string;
    capacity: string;
    used: string;
    usedPercent: number;
    entryCount: number;
}

const TIER_DEFS = [
    { tier: 0, name: 'Working Memory', subtitle: 'LLM Context Window', icon: React.memo(Brain) as any, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20', capacity: '128K tokens' },
    { tier: 1, name: 'Session Memory', subtitle: 'Recent conversations', icon: React.memo(Clock) as any, color: 'text-cyan-500', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/20', capacity: '10 MB' },
    { tier: 2, name: 'Knowledge Memory', subtitle: 'LanceDB + QMD + Hybrid', icon: React.memo(Database) as any, color: 'text-purple-500', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/20', capacity: '1 GB' },
    { tier: 3, name: 'Deep Memory', subtitle: 'Knowledge Graph + Archive', icon: React.memo(Brain) as any, color: 'text-amber-500', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20', capacity: '10 GB+' },
];

// No demo data — all memories fetched from real kernel

const TYPE_COLORS: Record<string, string> = {
    conversation: 'text-blue-500',
    knowledge: 'text-cyan-500',
    qmd: 'text-purple-500',
    entity: 'text-amber-500',
    preference: 'text-emerald-500',
    pattern: 'text-pink-500',
};

const TYPE_BG: Record<string, string> = {
    conversation: 'bg-blue-500/10',
    knowledge: 'bg-cyan-500/10',
    qmd: 'bg-purple-500/10',
    entity: 'bg-amber-500/10',
    preference: 'bg-emerald-500/10',
    pattern: 'bg-pink-500/10',
};


export function MemoryExplorer() {
    const [activeView, setActiveView] = useState<'overview' | 'search' | 'timeline' | 'manage'>('overview');
    const [selectedTier, setSelectedTier] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<MemoryEntry[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedMemory, setSelectedMemory] = useState<MemoryEntry | null>(null);
    const [memories, setMemories] = useState<MemoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [kernelMemStats, setKernelMemStats] = useState<Record<string, any> | null>(null);

    // Fetch kernel memory_stats from status endpoint
    useEffect(() => {
        const fetchKernelStats = async () => {
            try {
                const status = await kernelApi.getStatus();
                if (status?.memory_stats) {
                    setKernelMemStats(status.memory_stats);
                }
            } catch (e) {
                // Kernel not connected — fall back to computed stats
            }
        };
        fetchKernelStats();
    }, []);

    // Compute tier stats from actual fetched memories + kernel stats
    const TIERS: TierInfo[] = useMemo(() => {
        const tierCounts = [0, 0, 0, 0];
        for (const m of memories) {
            if (m.tier >= 0 && m.tier <= 3) tierCounts[m.tier]++;
        }

        const workingCount = kernelMemStats?.working_memory_count ?? tierCounts[0];
        const workingLimit = kernelMemStats?.working_memory_limit ?? 50;
        const workingPct = workingLimit > 0 ? Math.round((workingCount / workingLimit) * 100) : 0;

        return TIER_DEFS.map((def, i) => {
            const count = i === 0 ? workingCount : tierCounts[i];
            let usedPercent: number;
            let used: string;

            if (i === 0) {
                usedPercent = workingPct;
                used = `${workingCount} entries`;
            } else if (i === 1) {
                usedPercent = count > 0 ? Math.min(Math.round((count / 1000) * 100), 100) : 0;
                used = `${count} entries`;
            } else if (i === 2) {
                usedPercent = count > 0 ? Math.min(Math.round((count / 50000) * 100), 100) : 0;
                used = `${count} entries`;
            } else {
                usedPercent = count > 0 ? Math.min(Math.round((count / 500000) * 100), 100) : 0;
                used = `${count} entries`;
            }

            return { ...def, used, usedPercent, entryCount: count };
        });
    }, [memories, kernelMemStats]);

    const fetchMemories = async () => {
        setLoading(true);
        try {
            const result = await memoryApi.query("", "all", 100);
            if (result && result.success && result.results.length > 0) {
                const realMemories = result.results.map(r => ({
                    id: r.id,
                    tier: (r.tier === 'working' ? 0 : r.tier === 'session' ? 1 : r.tier === 'knowledge' ? 2 : 3) as 0 | 1 | 2 | 3,
                    content: r.content,
                    type: (r.metadata?.type || 'knowledge') as any,
                    timestamp: r.created_at || new Date().toISOString().split('T')[0],
                    score: r.score,
                    tags: r.metadata?.tags || [],
                    accessCount: r.metadata?.access_count || 1
                }));
                setMemories(realMemories);
            } else {
                setMemories([]);
            }
        } catch (e) {
            console.error("Failed to fetch memories:", e);
            setMemories([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMemories();
    }, []);

    const filteredMemories = selectedTier !== null
        ? memories.filter(m => m.tier === selectedTier)
        : memories;

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        try {
            const result = await memoryApi.query(searchQuery, undefined, 20);
            if (result && result.success && result.results.length > 0) {
                const mapped = result.results.map(r => ({
                    id: r.id,
                    tier: (r.tier === 'working' ? 0 : r.tier === 'session' ? 1 : r.tier === 'knowledge' ? 2 : 3) as 0 | 1 | 2 | 3,
                    content: r.content,
                    type: (r.metadata?.type || 'knowledge') as any,
                    timestamp: r.created_at || '',
                    score: r.score,
                    tags: r.metadata?.tags || [],
                    accessCount: r.metadata?.access_count || 1
                }));
                setSearchResults(mapped);
            } else {
                // Fall back to local search if kernel returns nothing
                const results = memories.filter(m =>
                    m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    m.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
                );
                setSearchResults(results);
            }
        } catch {
            const results = memories.filter(m =>
                m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                m.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
            );
            setSearchResults(results);
        } finally {
            setIsSearching(false);
        }
    };

    const totalEntries = TIERS.reduce((sum, t) => sum + t.entryCount, 0) || memories.length;

    return (
        <div className="flex h-full bg-background text-foreground overflow-hidden font-sans">
            {/* Left Sidebar */}
            <div className="w-56 border-r border-border/40 flex flex-col bg-card/30">
                <div className="p-4 border-b border-border/30">
                    <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-primary" />
                        <span className="text-xs font-bold uppercase tracking-widest text-foreground/80">Memory</span>
                    </div>
                </div>

                <div className="flex-1 p-2 space-y-1">
                    {[
                        { key: 'overview', label: 'Tier Overview', icon: Layers },
                        { key: 'search', label: 'Semantic Search', icon: Search },
                        { key: 'timeline', label: 'Memory Timeline', icon: Clock },
                        { key: 'manage', label: 'Manage & Forget', icon: Trash2 },
                    ].map(item => (
                        <button
                            key={item.key}
                            onClick={() => setActiveView(item.key as any)}
                            className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all
                                ${activeView === item.key
                                    ? 'bg-primary/10 text-primary border border-primary/20'
                                    : 'hover:bg-muted/50 text-muted-foreground border border-transparent hover:text-foreground'}`}
                        >
                            <item.icon className="w-4 h-4" />
                            <span className="text-[11px] font-medium">{item.label}</span>
                        </button>
                    ))}
                </div>

                {/* Summary Stats */}
                <div className="p-4 border-t border-border/30 space-y-2">
                    <div className="bg-muted/30 rounded-xl p-3 border border-border/20">
                        <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Total Memories</p>
                        <p className="text-xl font-bold text-primary">{totalEntries.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto bg-background/50">
                <AnimatePresence mode="wait">
                    {/* Tier Overview */}
                    {activeView === 'overview' && (
                        <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 space-y-5">
                            <h2 className="text-sm font-semibold text-foreground/80">4-Tier Memory Architecture</h2>

                            {/* Tier Cards */}
                            <div className="grid grid-cols-2 gap-3">
                                {TIERS.map(tier => (
                                    <motion.div
                                        key={tier.tier}
                                        whileHover={{ scale: 1.01 }}
                                        onClick={() => setSelectedTier(selectedTier === tier.tier ? null : tier.tier)}
                                        className={`${tier.bgColor} border ${tier.borderColor} rounded-xl p-4 cursor-pointer transition-all
                                            ${selectedTier === tier.tier ? 'ring-2 ring-primary/30' : ''}`}
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                {/* @ts-ignore */}
                                                <tier.icon className={`w-5 h-5 ${tier.color}`} />
                                                <div>
                                                    <h3 className="text-xs font-semibold text-foreground/90">{tier.name}</h3>
                                                    <p className="text-[9px] text-muted-foreground">{tier.subtitle}</p>
                                                </div>
                                            </div>
                                            <span className={`text-[9px] font-bold ${tier.color} px-2 py-0.5 rounded-full ${tier.bgColor}`}>
                                                T{tier.tier}
                                            </span>
                                        </div>

                                        {/* Usage Bar */}
                                        <div className="h-1.5 bg-background/20 rounded-full overflow-hidden mb-2">
                                            <motion.div
                                                className={`h-full rounded-full ${tier.bgColor.replace('10', '40')}`}
                                                initial={{ width: 0 }}
                                                animate={{ width: `${tier.usedPercent}%` }}
                                                transition={{ delay: 0.3, duration: 0.8 }}
                                                style={{ background: `linear-gradient(90deg, currentColor, hsl(var(--primary) / 0.3))` }}
                                            />
                                        </div>

                                        <div className="flex justify-between text-[9px] text-muted-foreground">
                                            <span>{tier.used} / {tier.capacity}</span>
                                            <span>{tier.entryCount.toLocaleString()} entries</span>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Loading / Empty State */}
                            {loading && (
                                <div className="flex items-center justify-center py-8 text-muted-foreground">
                                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                                    <span className="text-xs">Loading memories from kernel...</span>
                                </div>
                            )}
                            {!loading && memories.length === 0 && selectedTier === null && (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Brain className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                    <p className="text-xs">No memories stored yet.</p>
                                    <p className="text-[10px] opacity-60 mt-1">Memories will appear here as AETHER learns.</p>
                                </div>
                            )}

                            {/* Filtered Entries */}
                            {selectedTier !== null && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-xs font-semibold text-foreground/80">
                                            Tier {selectedTier} Entries
                                        </h3>
                                        <button onClick={() => setSelectedTier(null)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                                            Clear filter
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {filteredMemories.map((mem, i) => (
                                            <motion.div
                                                key={mem.id}
                                                initial={{ opacity: 0, x: -5 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.05 }}
                                                onClick={() => setSelectedMemory(mem)}
                                                className="bg-card border border-border/40 rounded-xl p-3 cursor-pointer hover:bg-accent/50 transition-colors shadow-sm"
                                            >
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold ${TYPE_BG[mem.type]} ${TYPE_COLORS[mem.type]}`}>
                                                        {mem.type}
                                                    </span>
                                                    <span className="text-[9px] text-muted-foreground/60">{mem.timestamp}</span>
                                                    <span className="text-[9px] text-muted-foreground/40 ml-auto">{mem.accessCount}× accessed</span>
                                                </div>
                                                <p className="text-[11px] text-foreground/90 leading-relaxed line-clamp-2">{mem.content}</p>
                                                <div className="flex gap-1 mt-2">
                                                    {mem.tags.map(tag => (
                                                        <span key={tag} className="px-1.5 py-0.5 rounded bg-muted/50 text-[8px] text-muted-foreground border border-border/30">{tag}</span>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </motion.div>
                    )}

                    {/* Semantic Search */}
                    {activeView === 'search' && (
                        <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 space-y-5">
                            <h2 className="text-sm font-semibold text-foreground/80">Semantic Search</h2>
                            <p className="text-[10px] text-muted-foreground">Search across all memory tiers using natural language or keywords.</p>

                            <div className="flex gap-2">
                                <div className="flex-1 relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                        placeholder="e.g., 'deployment scripts' or 'what did I work on last week'"
                                        className="w-full bg-input/50 border border-border rounded-xl pl-10 pr-4 py-3 text-sm placeholder-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors text-foreground"
                                    />
                                </div>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handleSearch}
                                    disabled={isSearching}
                                    className="px-5 py-3 rounded-xl bg-primary/15 hover:bg-primary/25 text-primary text-xs font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                    Search
                                </motion.button>
                            </div>

                            {/* Results */}
                            {searchResults.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-[10px] text-muted-foreground">{searchResults.length} results found</p>
                                    {searchResults.map((mem, i) => {
                                        const tier = TIERS[mem.tier];
                                        return (
                                            <motion.div
                                                key={mem.id}
                                                initial={{ opacity: 0, y: 5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: i * 0.05 }}
                                                className="bg-card border border-border/40 rounded-xl p-4 hover:bg-accent/50 transition-colors shadow-sm"
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className={`${tier.bgColor} ${tier.color} text-[8px] font-bold px-1.5 py-0.5 rounded`}>
                                                        T{mem.tier}
                                                    </span>
                                                    <span className={`${TYPE_BG[mem.type]} ${TYPE_COLORS[mem.type]} text-[8px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded`}>
                                                        {mem.type}
                                                    </span>
                                                    <span className="text-[9px] text-muted-foreground/60 ml-auto">{mem.timestamp}</span>
                                                </div>
                                                <p className="text-[11px] leading-relaxed text-foreground/90">{mem.content}</p>
                                                <div className="flex gap-1 mt-2">
                                                    {mem.tags.map(tag => (
                                                        <span key={tag} className="px-1.5 py-0.5 rounded bg-muted/50 text-[8px] text-muted-foreground border border-border/30">{tag}</span>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* Timeline View */}
                    {activeView === 'timeline' && (
                        <motion.div key="timeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 space-y-4">
                            <h2 className="text-sm font-semibold text-foreground/80">Memory Timeline</h2>
                            <p className="text-[10px] text-muted-foreground">What AETHER remembers, and when it learned it.</p>

                            <div className="relative pl-6">
                                {/* Timeline Line */}
                                <div className="absolute left-2.5 top-0 bottom-0 w-px bg-gradient-to-b from-primary/40 via-primary/20 to-transparent" />

                                {memories.sort((a, b) => a.tier - b.tier).map((mem, i) => {
                                    const tier = TIERS[mem.tier];
                                    return (
                                        <motion.div
                                            key={mem.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.06 }}
                                            className="relative mb-4"
                                        >
                                            {/* Dot */}
                                            <div className={`absolute -left-[14.5px] top-3 w-3 h-3 rounded-full border-2 ${tier.borderColor} ${tier.bgColor}`} />

                                            <div className="bg-card border border-border/20 rounded-xl p-3 ml-2 hover:bg-muted/50 transition-colors shadow-sm">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className={`${tier.bgColor} ${tier.color} text-[8px] font-bold px-1.5 py-0.5 rounded`}>
                                                        T{mem.tier} · {tier.name}
                                                    </span>
                                                    <span className={`${TYPE_BG[mem.type]} ${TYPE_COLORS[mem.type]} text-[8px] uppercase font-bold px-1.5 py-0.5 rounded`}>
                                                        {mem.type}
                                                    </span>
                                                    <span className="text-[9px] text-muted-foreground/60 ml-auto">{mem.timestamp}</span>
                                                </div>
                                                <p className="text-[11px] leading-relaxed text-foreground/80">{mem.content}</p>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}

                    {/* Manage & Forget */}
                    {activeView === 'manage' && (
                        <motion.div key="manage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 space-y-4">
                            <h2 className="text-sm font-semibold text-foreground/80">Manage Memories</h2>
                            <p className="text-[10px] text-muted-foreground">Manually delete specific memories or clear entire tiers.</p>

                            <div className="space-y-2">
                                {TIERS.map(tier => (
                                    <div key={tier.tier} className={`${tier.bgColor} border ${tier.borderColor} rounded-xl p-4 flex items-center justify-between`}>
                                        <div className="flex items-center gap-3">
                                            {/* @ts-ignore */}
                                            <tier.icon className={`w-5 h-5 ${tier.color}`} />
                                            <div>
                                                <p className="text-xs font-semibold text-foreground/90">{tier.name}</p>
                                                <p className="text-[9px] text-muted-foreground">{tier.entryCount.toLocaleString()} entries · {tier.used}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button className="px-3 py-1.5 rounded-lg bg-background/50 hover:bg-background text-[10px] font-medium transition-colors text-foreground/80 border border-border/30">
                                                Export
                                            </button>
                                            <button className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[10px] font-medium transition-colors flex items-center gap-1">
                                                <Trash2 className="w-3 h-3" />
                                                Clear
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Memory Detail Overlay */}
            <AnimatePresence>
                {selectedMemory && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setSelectedMemory(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-lg bg-card border border-border rounded-2xl p-6 shadow-2xl"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold text-foreground">Memory Detail</h3>
                                <button onClick={() => setSelectedMemory(null)} className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="flex gap-2 mb-3">
                                <span className={`${TIERS[selectedMemory.tier].bgColor} ${TIERS[selectedMemory.tier].color} text-[9px] font-bold px-2 py-0.5 rounded`}>
                                    Tier {selectedMemory.tier}
                                </span>
                                <span className={`${TYPE_BG[selectedMemory.type]} ${TYPE_COLORS[selectedMemory.type]} text-[9px] uppercase font-bold px-2 py-0.5 rounded`}>
                                    {selectedMemory.type}
                                </span>
                            </div>
                            <p className="text-xs leading-relaxed mb-4 text-foreground/90">{selectedMemory.content}</p>
                            <div className="space-y-2 text-[10px] text-muted-foreground border-t border-border/30 pt-4">
                                <div className="flex justify-between border-b border-border/10 pb-1"><span>Timestamp</span><span className="text-foreground/70">{selectedMemory.timestamp}</span></div>
                                <div className="flex justify-between border-b border-border/10 pb-1"><span>Access Count</span><span className="text-foreground/70">{selectedMemory.accessCount}</span></div>
                                <div className="flex justify-between items-start pt-1">
                                    <span>Tags</span>
                                    <div className="flex gap-1 flex-wrap justify-end max-w-[70%]">
                                        {selectedMemory.tags.map(t => (
                                            <span key={t} className="px-1 py-0.5 bg-muted rounded text-[9px] text-foreground/80">{t}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2 mt-6">
                                <button className="flex-1 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground/80 text-xs font-medium transition-colors border border-border/50">
                                    Edit
                                </button>
                                <button className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-medium transition-colors flex items-center gap-1.5">
                                    <Trash2 className="w-3 h-3" /> Forget
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
