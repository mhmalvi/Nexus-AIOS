
import React, { useState, useEffect } from "react";
import { Shield, AlertTriangle, Activity, Lock, Key, Eye, Clock, CheckCircle2, XCircle, ChevronRight, FileText, Terminal, Globe, Zap, ShieldAlert, ShieldCheck, ShieldOff, Skull, RefreshCw, Search, Filter, Network } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { firewallApi } from "../../services/tauriApi";

interface AuditFinding {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    category: string;
    title: string;
    description: string;
    timestamp: string;
    resolved: boolean;
}

interface ActivityEntry {
    id: string;
    agent: string;
    action: string;
    tool: string;
    timestamp: string;
    approved: boolean;
    risk: 'safe' | 'cautious' | 'dangerous';
}

interface ToolUsage {
    tool: string;
    count: number;
    lastUsed: string;
    byAgent: string;
}

// No demo data — all data fetched from real kernel

const SEVERITY_CONFIG = {
    critical: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: Skull },
    high: { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', icon: ShieldAlert },
    medium: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: AlertTriangle },
    low: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: ShieldCheck },
    info: { color: 'text-zinc-400', bg: 'bg-zinc-500/10', border: 'border-zinc-500/30', icon: Eye },
};

export function SecurityCenter() {
    const [activeTab, setActiveTab] = useState<'audit' | 'activity' | 'tools' | 'destruct' | 'firewall'>('audit');
    const [findings, setFindings] = useState<AuditFinding[]>([]);
    const [activities, setActivities] = useState<ActivityEntry[]>([]);
    const [toolUsage, setToolUsage] = useState<ToolUsage[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [filterSeverity, setFilterSeverity] = useState<string | null>(null);
    const [destructStep, setDestructStep] = useState(0);
    const [destructPin, setDestructPin] = useState('');
    const [loadingAudit, setLoadingAudit] = useState(true);

    // Firewall State
    const [fwRules, setFwRules] = useState<any[]>([]);
    const [newRulePattern, setNewRulePattern] = useState('');
    const [newRuleAction, setNewRuleAction] = useState('deny');

    // Fetch Audit Logs on mount and when switching to activity tab
    useEffect(() => {
        const fetchAuditData = async () => {
            try {
                const { safetyApi } = await import("../../services/tauriApi");
                const res = await safetyApi.getAuditLog(100);
                if (res && res.entries && res.entries.length > 0) {
                    // Map entries to activity format
                    const mappedActivity = res.entries.map(entry => ({
                        id: entry.id,
                        timestamp: new Date(entry.timestamp).toLocaleTimeString(),
                        agent: entry.details?.agent || 'System',
                        action: entry.action,
                        tool: entry.details?.tool || 'unknown',
                        approved: entry.approved,
                        risk: (entry.risk_level as 'safe' | 'cautious' | 'dangerous') || 'safe'
                    }));
                    setActivities(mappedActivity);

                    // Derive findings from audit entries with risk
                    const derivedFindings: AuditFinding[] = res.entries
                        .filter(e => e.risk_level && e.risk_level !== 'low')
                        .map((e, i) => ({
                            id: e.id || `f${i}`,
                            severity: (e.risk_level === 'critical' ? 'critical' : e.risk_level === 'high' ? 'high' : 'medium') as any,
                            category: e.details?.category || 'System',
                            title: e.action,
                            description: e.details?.description || `Action: ${e.action}`,
                            timestamp: new Date(e.timestamp).toLocaleString(),
                            resolved: e.approved
                        }));
                    if (derivedFindings.length > 0) {
                        setFindings(derivedFindings);
                    }

                    // Derive tool usage from activity
                    const toolMap = new Map<string, ToolUsage>();
                    for (const a of mappedActivity) {
                        const existing = toolMap.get(a.tool);
                        if (existing) {
                            existing.count++;
                            existing.lastUsed = a.timestamp;
                        } else {
                            toolMap.set(a.tool, { tool: a.tool, count: 1, lastUsed: a.timestamp, byAgent: a.agent });
                        }
                    }
                    setToolUsage(Array.from(toolMap.values()).sort((a, b) => b.count - a.count));
                }
            } catch (err) {
                console.error("Failed to fetch audit logs:", err);
            } finally {
                setLoadingAudit(false);
            }
        };
        fetchAuditData();
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'firewall') {
            firewallApi.getRules().then(res => {
                if (res.success && res.data?.rules) {
                    setFwRules(res.data.rules);
                }
            });
        }
    }, [activeTab]);

    const handleAddRule = async () => {
        if (!newRulePattern) return;
        const res = await firewallApi.addRule(newRulePattern, newRuleAction, 'user', 'Manual rule');
        if (res.success) {
            setNewRulePattern('');
            // Refresh
            const rules = await firewallApi.getRules();
            if (rules.data?.rules) setFwRules(rules.data.rules);
        }
    };

    const handleRemoveRule = async (id: string) => {
        await firewallApi.deleteRule(id);
        const rules = await firewallApi.getRules();
        if (rules.data?.rules) setFwRules(rules.data.rules);
    };

    const critCount = findings.filter(f => f.severity === 'critical' && !f.resolved).length;
    const highCount = findings.filter(f => f.severity === 'high' && !f.resolved).length;
    const unresolvedCount = findings.filter(f => !f.resolved).length;

    const handleRunAudit = async () => {
        setIsScanning(true);
        try {
            const { kernelBridge } = await import("../../services/kernelEventBridge");
            const result = await kernelBridge.sendAndWait(
                JSON.stringify({ action: 'run_audit' }),
                'security',
                15000
            );
            if (result?.data?.findings) {
                setFindings(result.data.findings.map((f: any, i: number) => ({
                    id: f.id || `audit_${i}`,
                    severity: f.severity || 'info',
                    category: f.category || 'System',
                    title: f.title || f.action || 'Finding',
                    description: f.description || '',
                    timestamp: f.timestamp || new Date().toLocaleString(),
                    resolved: f.resolved || false
                })));
            }
        } catch (e) {
            console.error('Audit scan failed:', e);
        } finally {
            setIsScanning(false);
        }
    };

    const filteredFindings = filterSeverity
        ? findings.filter(f => f.severity === filterSeverity)
        : findings;

    return (
        <div className="flex h-full bg-background text-foreground overflow-hidden">
            {/* Left Sidebar - Navigation */}
            <div className="w-56 border-r border-border/40 flex flex-col">
                <div className="p-4 border-b border-border/30">
                    <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-primary" />
                        <span className="text-xs font-bold uppercase tracking-widest">Security</span>
                    </div>
                </div>

                <div className="flex-1 p-2 space-y-1">
                    {[
                        { key: 'audit', label: 'Audit Dashboard', icon: ShieldCheck, badge: unresolvedCount },
                        { key: 'activity', label: 'Activity Log', icon: Activity },
                        { key: 'firewall', label: 'Network Firewall', icon: Network },
                        { key: 'tools', label: 'Tool Usage', icon: Terminal },
                        { key: 'destruct', label: 'Self-Destruct', icon: Skull },
                    ].map(item => (
                        <button
                            key={item.key}
                            onClick={() => setActiveTab(item.key as any)}
                            className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all
                                ${activeTab === item.key ? 'bg-primary/10 text-primary border border-primary/20' : 'hover:bg-white/5 text-muted-foreground border border-transparent'}`}
                        >
                            <item.icon className="w-4 h-4" />
                            <span className="text-[11px] font-medium flex-1">{item.label}</span>
                            {item.badge && (
                                <span className="px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[9px] font-bold">{item.badge}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Security Score */}
                <div className="p-4 border-t border-border/30">
                    <div className="bg-white/[0.03] rounded-xl p-3 border border-border/20 text-center">
                        <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Security Score</p>
                        <p className={`text-2xl font-bold ${critCount > 0 ? 'text-red-400' : highCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {critCount > 0 ? '42' : highCount > 0 ? '68' : '95'}/100
                        </p>
                        <p className="text-[9px] text-muted-foreground mt-1">
                            {critCount} critical · {highCount} high
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">
                    {/* Audit Tab */}
                    {activeTab === 'audit' && (
                        <motion.div key="audit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 space-y-5">
                            {/* Header */}
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-semibold">Security Audit</h2>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handleRunAudit}
                                    disabled={isScanning}
                                    className="px-4 py-2 rounded-xl text-xs font-medium bg-primary/15 hover:bg-primary/25 text-primary transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                                    {isScanning ? 'Scanning...' : 'Run Audit'}
                                </motion.button>
                            </div>

                            {/* Summary Cards */}
                            <div className="grid grid-cols-4 gap-3">
                                {[
                                    { label: 'Critical', count: critCount, color: 'text-red-400', bg: 'bg-red-500/10' },
                                    { label: 'High', count: highCount, color: 'text-orange-400', bg: 'bg-orange-500/10' },
                                    { label: 'Medium', count: findings.filter(f => f.severity === 'medium' && !f.resolved).length, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                                    { label: 'Resolved', count: findings.filter(f => f.resolved).length, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                                ].map(card => (
                                    <div key={card.label} className={`${card.bg} rounded-xl p-3 border border-border/20 cursor-pointer hover:opacity-80 transition-opacity`}
                                        onClick={() => setFilterSeverity(filterSeverity === card.label.toLowerCase() ? null : card.label.toLowerCase())}>
                                        <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{card.label}</p>
                                        <p className={`text-xl font-bold ${card.color} mt-1`}>{card.count}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Scanning Animation */}
                            <AnimatePresence>
                                {isScanning && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="bg-primary/5 border border-primary/20 rounded-xl p-4 overflow-hidden"
                                    >
                                        <div className="flex items-center gap-3">
                                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                                                <RefreshCw className="w-5 h-5 text-primary" />
                                            </motion.div>
                                            <div>
                                                <p className="text-xs font-semibold text-primary">Scanning System...</p>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">Checking API keys, permissions, network rules, memory encryption...</p>
                                            </div>
                                        </div>
                                        <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
                                            <motion.div
                                                className="h-full bg-primary/60 rounded-full"
                                                initial={{ width: '0%' }}
                                                animate={{ width: '100%' }}
                                                transition={{ duration: 3, ease: 'linear' }}
                                            />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Findings List */}
                            <div className="space-y-2">
                                {loadingAudit && (
                                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                                        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                                        <span className="text-xs">Loading audit data...</span>
                                    </div>
                                )}
                                {!loadingAudit && filteredFindings.length === 0 && (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                        <p className="text-xs">No security findings.</p>
                                        <p className="text-[10px] opacity-60 mt-1">Run an audit to scan for issues.</p>
                                    </div>
                                )}
                                {filteredFindings.map((finding, i) => {
                                    const cfg = SEVERITY_CONFIG[finding.severity];
                                    return (
                                        <motion.div
                                            key={finding.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            className={`${cfg.bg} border ${cfg.border} rounded-xl p-4 ${finding.resolved ? 'opacity-50' : ''}`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <cfg.icon className={`w-4 h-4 mt-0.5 ${cfg.color}`} />
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="text-xs font-semibold">{finding.title}</h3>
                                                        <span className={`px-1.5 py-0.5 rounded-full text-[8px] uppercase tracking-wider font-bold ${cfg.bg} ${cfg.color}`}>
                                                            {finding.severity}
                                                        </span>
                                                        {finding.resolved && (
                                                            <span className="px-1.5 py-0.5 rounded-full text-[8px] uppercase tracking-wider font-bold bg-emerald-500/20 text-emerald-400">
                                                                Resolved
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground mt-1">{finding.description}</p>
                                                    <p className="text-[9px] text-muted-foreground/60 mt-1.5">{finding.category} · {finding.timestamp}</p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}

                    {/* Activity Log Tab */}
                    {activeTab === 'activity' && (
                        <motion.div key="activity" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 space-y-4">
                            <h2 className="text-sm font-semibold">Activity Log</h2>
                            <p className="text-[10px] text-muted-foreground">Every action AETHER and its agents took, with timestamps and approval status.</p>

                            <div className="space-y-1.5">
                                {activities.length === 0 && !loadingAudit && (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <Activity className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                        <p className="text-xs">No activity recorded yet.</p>
                                        <p className="text-[10px] opacity-60 mt-1">Agent actions will appear here in real-time.</p>
                                    </div>
                                )}
                                {activities.map((entry, i) => (
                                    <motion.div
                                        key={entry.id}
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.03 }}
                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-colors
                                            ${entry.risk === 'dangerous' ? 'bg-red-500/5 border-red-500/20' : 'bg-white/[0.02] border-border/15 hover:bg-white/[0.04]'}`}
                                    >
                                        {entry.approved ? (
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                        ) : (
                                            <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                        )}

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] font-semibold truncate">{entry.action}</span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[9px] text-muted-foreground">{entry.agent}</span>
                                                <span className="text-[9px] text-muted-foreground/50">·</span>
                                                <span className="text-[9px] font-mono text-muted-foreground/70">{entry.tool}</span>
                                            </div>
                                        </div>

                                        <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold
                                            ${entry.risk === 'safe' ? 'text-emerald-400 bg-emerald-500/10' : entry.risk === 'cautious' ? 'text-amber-400 bg-amber-500/10' : 'text-red-400 bg-red-500/10'}`}>
                                            {entry.risk}
                                        </span>

                                        <span className="text-[9px] text-muted-foreground/60 font-mono shrink-0">{entry.timestamp}</span>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {/* Tool Usage Tab */}
                    {activeTab === 'tools' && (
                        <motion.div key="tools" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 space-y-4">
                            <h2 className="text-sm font-semibold">Tool Usage Report</h2>
                            <p className="text-[10px] text-muted-foreground">Which tools were used, how often, and by which agent.</p>

                            <div className="space-y-2">
                                {toolUsage.length === 0 && !loadingAudit && (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <Terminal className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                        <p className="text-xs">No tool usage recorded yet.</p>
                                    </div>
                                )}
                                {toolUsage.map(tool => {
                                    const maxCount = Math.max(...toolUsage.map(t => t.count), 1);
                                    const pct = (tool.count / maxCount) * 100;
                                    return (
                                        <div key={tool.tool} className="bg-white/[0.03] rounded-xl p-4 border border-border/20">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] font-mono font-semibold">{tool.tool}</span>
                                                </div>
                                                <span className="text-[11px] font-bold">{tool.count.toLocaleString()}</span>
                                            </div>
                                            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-2">
                                                <motion.div
                                                    className="h-full bg-gradient-to-r from-primary/60 to-cyan-400/60 rounded-full"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${pct}%` }}
                                                    transition={{ delay: 0.2, duration: 0.8 }}
                                                />
                                            </div>
                                            <div className="flex justify-between text-[9px] text-muted-foreground">
                                                <span>Primary: {tool.byAgent}</span>
                                                <span>Last: {tool.lastUsed}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}


                    {/* Firewall Tab */}
                    {activeTab === 'firewall' && (
                        <motion.div key="firewall" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 space-y-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-sm font-semibold">Network Firewall</h2>
                                    <p className="text-[10px] text-muted-foreground">eBPF-based outbound traffic control. Default policy: DENY ALL.</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono border border-emerald-500/20">Active</span>
                                </div>
                            </div>

                            {/* Add Rule Form */}
                            <div className="bg-white/[0.03] rounded-xl p-3 border border-border/20 flex items-center gap-2">
                                <Search className="w-4 h-4 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="*.openai.com"
                                    className="bg-transparent border-none outline-none text-xs flex-1 font-mono placeholder-muted-foreground/50"
                                    value={newRulePattern}
                                    onChange={(e) => setNewRulePattern(e.target.value)}
                                />
                                <select
                                    className="bg-black/20 border border-border/30 rounded px-2 py-1 text-[10px] outline-none"
                                    value={newRuleAction}
                                    onChange={(e) => setNewRuleAction(e.target.value)}
                                >
                                    <option value="allow">ALLOW</option>
                                    <option value="deny">DENY</option>
                                </select>
                                <button
                                    onClick={handleAddRule}
                                    className="px-3 py-1 bg-primary/20 hover:bg-primary/30 text-primary text-[10px] font-bold rounded transition-colors"
                                >
                                    ADD RULE
                                </button>
                            </div>

                            {/* Rules List */}
                            <div className="space-y-2">
                                {fwRules.length === 0 ? (
                                    <p className="text-center text-muted-foreground text-xs py-8">No specific rules enabled.</p>
                                ) : (
                                    fwRules.map((rule, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="flex items-center justify-between bg-white/[0.02] border border-border/10 rounded-lg p-2.5"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-1.5 h-1.5 rounded-full ${rule.action === 'ALLOW' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                                <span className="text-xs font-mono">{rule.pattern}</span>
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded ${rule.action === 'ALLOW' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                                    {rule.action}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => handleRemoveRule(rule.id)}
                                                className="opacity-0 hover:opacity-100 p-1 hover:bg-red-500/20 rounded text-red-400 transition-all"
                                            >
                                                <XCircle className="w-3.5 h-3.5" />
                                            </button>
                                        </motion.div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* Self-Destruct Tab */}
                    {activeTab === 'destruct' && (
                        <motion.div key="destruct" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 space-y-5">
                            <div className="text-center py-6">
                                <Skull className="w-10 h-10 text-red-500 mx-auto mb-3" />
                                <h2 className="text-lg font-bold text-red-400">Self-Destruct Configuration</h2>
                                <p className="text-[11px] text-muted-foreground mt-1 max-w-md mx-auto">
                                    Configure kill switch options for emergency data destruction. Requires voice print + PIN to activate.
                                </p>
                            </div>

                            {/* Destruct Levels */}
                            <div className="space-y-3">
                                {[
                                    { level: 'Soft Lock', desc: 'Lock screen, disable agents, alert owner', trigger: '3 failed auth attempts', recovery: 'Master PIN', color: 'amber' },
                                    { level: 'Hard Lock', desc: 'Encrypt all data, disable SSH, wipe API keys', trigger: '5 failed attempts / remote', recovery: 'Recovery key', color: 'orange' },
                                    { level: 'Data Wipe', desc: 'Secure-erase ~/.aether, all sessions, all memory', trigger: 'Voice + PIN + countdown', recovery: 'UNRECOVERABLE', color: 'red' },
                                    { level: 'Full Destruct', desc: 'dd wipe entire drive, 3-pass overwrite', trigger: 'Physical button + voice print', recovery: 'UNRECOVERABLE', color: 'red' },
                                ].map((item, i) => (
                                    <div key={item.level} className={`bg-${item.color}-500/5 border border-${item.color}-500/20 rounded-xl p-4`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className={`text-xs font-bold text-${item.color}-400`}>{item.level}</h3>
                                            <span className={`text-[8px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-${item.color}-500/10 text-${item.color}-400 font-bold`}>
                                                Level {i + 1}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                                        <div className="flex justify-between mt-2 text-[9px]">
                                            <span className="text-muted-foreground/70">Trigger: {item.trigger}</span>
                                            <span className={item.recovery === 'UNRECOVERABLE' ? 'text-red-400 font-bold' : 'text-muted-foreground/70'}>
                                                Recovery: {item.recovery}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Configure Section */}
                            <div className="bg-white/[0.03] rounded-xl p-4 border border-border/20">
                                <h3 className="text-xs font-semibold mb-3">Configuration</h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Self-Destruct PIN</label>
                                        <input
                                            type="password"
                                            value={destructPin}
                                            onChange={e => setDestructPin(e.target.value)}
                                            placeholder="Set 4-8 digit PIN"
                                            className="w-full bg-white/5 border border-border/30 rounded-xl px-4 py-2.5 text-sm placeholder-muted-foreground/50 focus:outline-none focus:border-red-500/50 transition-colors font-mono"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between py-2 border-t border-border/10">
                                        <div>
                                            <p className="text-[11px] font-medium">Dead Man Switch</p>
                                            <p className="text-[9px] text-muted-foreground">Auto-wipe if no owner check-in for N days</p>
                                        </div>
                                        <div className="w-10 h-5 rounded-full bg-white/10 relative cursor-pointer">
                                            <div className="w-4 h-4 rounded-full bg-muted-foreground/40 absolute left-0.5 top-0.5 transition-transform" />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between py-2 border-t border-border/10">
                                        <div>
                                            <p className="text-[11px] font-medium">Voice Print Required</p>
                                            <p className="text-[9px] text-muted-foreground">Require voice authentication for activation</p>
                                        </div>
                                        <div className="w-10 h-5 rounded-full bg-primary/30 relative cursor-pointer">
                                            <div className="w-4 h-4 rounded-full bg-primary absolute right-0.5 top-0.5 transition-transform" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
