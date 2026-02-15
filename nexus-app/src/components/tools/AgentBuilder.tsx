import React, { useState, useEffect } from "react";
import { Plus, Layers, Terminal, Globe, Folder, Scale, Shield, Brain, MessageSquare, ChevronRight, ChevronDown, Sparkles, Edit3, Save, X, Bot, Play, Square, RotateCcw, Copy, Trash2, Settings, Zap, Mail, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { kernelApi, KernelResponse } from "../../services/tauriApi";
import { kernelBridge } from "../../services/kernelEventBridge";
import { AgentCanvas, Connection } from "./AgentCanvas";

interface AgentConfig {
    id: string;
    name: string;
    avatar: string;
    description: string;
    model: string;
    provider: string;
    toolPolicy: 'minimal' | 'coding' | 'messaging' | 'full';
    persona: string;
    memoryScope: 'shared' | 'isolated';
    status: 'idle' | 'running' | 'error' | 'scheduled';
    triggers: string[];
    channels: string[];
    createdAt: string;
    sessionsCount: number;
    tokensUsed: number;
}

const TOOL_POLICIES = {
    minimal: { label: 'Minimal', icon: Shield, color: 'text-green-400', desc: 'Read-only file access' },
    coding: { label: 'Coding', icon: Terminal, color: 'text-cyan-400', desc: 'File read/write + shell' },
    messaging: { label: 'Messaging', icon: Mail, color: 'text-purple-400', desc: 'Network + messaging' },
    full: { label: 'Full Access', icon: Zap, color: 'text-amber-400', desc: 'All tools enabled' },
};

const PROVIDERS = ['Groq', 'Cerebras', 'Gemini', 'Mistral', 'OpenRouter', 'Ollama'];
const MODELS: Record<string, string[]> = {
    Groq: ['llama-3.3-70b', 'llama-3.1-8b', 'mixtral-8x7b'],
    Cerebras: ['llama-3.3-70b'],
    Gemini: ['gemini-2.0-flash', 'gemini-1.5-pro'],
    Mistral: ['mistral-large-2', 'codestral', 'mistral-small'],
    OpenRouter: ['claude-3.5-sonnet', 'gpt-4o', 'deepseek-v3'],
    Ollama: ['llama3.2', 'codellama', 'mistral'],
};

const STORAGE_KEY = 'nexus-agents';
const LAYOUT_STORAGE_KEY = 'nexus-agents-layout';

export function AgentBuilder() {
    // --- Agents State (Registry) ---
    const [agents, setAgents] = useState<AgentConfig[]>(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try { return JSON.parse(saved); } catch (e) { console.error("Failed to parse agents", e); }
        }
        return [];
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
    }, [agents]);

    // --- Layout State (Canvas) ---
    const [layout, setLayout] = useState<{
        connections: Connection[];
        positions: Record<string, { x: number; y: number }>;
    }>(() => {
        const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
        let parsed = { connections: [], positions: {} };
        if (saved) {
            try { parsed = JSON.parse(saved); } catch (e) { console.error("Failed to parse layout", e); }
        }
        return parsed;
    });

    useEffect(() => {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    }, [layout]);

    // Ensure all agents have a position (simple auto-layout for new ones)
    useEffect(() => {
        let hasChanges = false;
        const newPositions = { ...layout.positions };

        agents.forEach((agent, i) => {
            if (!newPositions[agent.id]) {
                newPositions[agent.id] = {
                    x: 100 + (i % 3) * 250,
                    y: 100 + Math.floor(i / 3) * 180
                };
                hasChanges = true;
            }
        });

        if (hasChanges) {
            setLayout(prev => ({ ...prev, positions: newPositions }));
        }
    }, [agents.length]); // Only run when agent count changes

    // --- view State ---
    const [selectedAgent, setSelectedAgent] = useState<string | null>('main');
    const [view, setView] = useState<'registry' | 'create' | 'canvas'>('registry');
    const [expandedSection, setExpandedSection] = useState<string | null>('general');

    // --- Wizard State ---
    const [wizardStep, setWizardStep] = useState(0);
    const [newAgent, setNewAgent] = useState<Partial<AgentConfig>>({
        name: '', avatar: '🤖', description: '', model: 'llama-3.3-70b', provider: 'Groq',
        toolPolicy: 'minimal', persona: '', memoryScope: 'shared', triggers: [], channels: ['chat'],
    });

    const selected = agents.find(a => a.id === selectedAgent);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'running': return 'bg-emerald-500';
            case 'idle': return 'bg-zinc-500';
            case 'error': return 'bg-red-500';
            case 'scheduled': return 'bg-amber-500';
            default: return 'bg-zinc-600';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'running': return 'ACTIVE';
            case 'idle': return 'IDLE';
            case 'error': return 'ERROR';
            case 'scheduled': return 'SCHEDULED';
            default: return status;
        }
    };

    const handleCreateAgent = async () => {
        const agent: AgentConfig = {
            id: `agent_${Date.now()}`,
            name: newAgent.name || 'Unnamed Agent',
            avatar: newAgent.avatar || '🤖',
            description: newAgent.description || '',
            model: newAgent.model || 'llama-3.3-70b',
            provider: newAgent.provider || 'Groq',
            toolPolicy: (newAgent.toolPolicy as any) || 'minimal',
            persona: newAgent.persona || '',
            memoryScope: (newAgent.memoryScope as any) || 'shared',
            status: 'idle',
            triggers: newAgent.triggers || [],
            channels: newAgent.channels || ['chat'],
            createdAt: new Date().toISOString().split('T')[0],
            sessionsCount: 0,
            tokensUsed: 0,
        };

        // Register with kernel
        try {
            await kernelBridge.sendAndWait(
                JSON.stringify({
                    action: 'register_agent',
                    agent_id: agent.id,
                    name: agent.name,
                    model: agent.model,
                    provider: agent.provider,
                    tool_policy: agent.toolPolicy,
                    persona: agent.persona,
                    memory_scope: agent.memoryScope,
                    channels: agent.channels,
                }),
                'agent_registry',
                10000
            );
        } catch (e) {
            console.warn('Kernel agent registration failed (non-blocking):', e);
        }

        setAgents([...agents, agent]);
        setSelectedAgent(agent.id);
        setView('registry');
        setWizardStep(0);
    };

    return (
        <div className="flex h-full bg-background text-foreground overflow-hidden">
            {/* Left Panel — Agent Registry */}
            <div className="w-72 border-r border-border/40 flex flex-col">
                {/* Tabs */}
                <div className="flex border-b border-border/30">
                    {(['registry', 'create', 'canvas'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setView(tab)}
                            className={`flex-1 py-2.5 text-[10px] uppercase tracking-widest font-medium transition-all
                                ${view === tab ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
                        >
                            {tab === 'registry' ? 'Registry' : tab === 'create' ? 'Create' : 'Canvas'}
                        </button>
                    ))}
                </div>

                {/* Agent List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {agents.map(agent => (
                        <motion.button
                            key={agent.id}
                            onClick={() => { setSelectedAgent(agent.id); setView('registry'); }}
                            whileHover={{ x: 2 }}
                            className={`w-full text-left p-3 rounded-xl transition-all group
                                ${selectedAgent === agent.id ? 'bg-primary/10 border border-primary/20' : 'hover:bg-white/5 border border-transparent'}`}
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-lg">{agent.avatar}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold truncate">{agent.name}</span>
                                        <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(agent.status)}`} />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{agent.provider} · {agent.model}</p>
                                </div>
                            </div>
                        </motion.button>
                    ))}
                </div>

                {/* Add Agent Button */}
                <div className="p-3 border-t border-border/30">
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => { setView('create'); setWizardStep(0); }}
                        className="w-full py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium flex items-center justify-center gap-2 transition-colors border border-primary/20"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        New Agent
                    </motion.button>
                </div>
            </div>

            {/* Right Panel — Details / Create Wizard / Canvas */}
            <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">
                    {view === 'registry' && selected && (
                        <motion.div key="details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6 space-y-6">
                            {/* Agent Header */}
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-500/10 flex items-center justify-center text-2xl border border-primary/20">
                                        {selected.avatar}
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-semibold">{selected.name}</h2>
                                        <p className="text-xs text-muted-foreground mt-0.5">{selected.description}</p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-bold ${getStatusColor(selected.status)} text-white`}>
                                                {getStatusLabel(selected.status)}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">Created {selected.createdAt}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    {selected.status === 'running' ? (
                                        <button
                                            onClick={async () => {
                                                try {
                                                    await kernelBridge.sendAndWait(
                                                        JSON.stringify({ action: 'stop_agent', agent_id: selected.id }),
                                                        'agent_registry', 10000
                                                    );
                                                } catch (e) { /* non-blocking */ }
                                                setAgents(prev => prev.map(a => a.id === selected.id ? { ...a, status: 'idle' } : a));
                                            }}
                                            className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                                        >
                                            <Square className="w-4 h-4" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={async () => {
                                                try {
                                                    await kernelBridge.sendAndWait(
                                                        JSON.stringify({ action: 'start_agent', agent_id: selected.id, model: selected.model, provider: selected.provider }),
                                                        'agent_registry', 10000
                                                    );
                                                } catch (e) { /* non-blocking */ }
                                                setAgents(prev => prev.map(a => a.id === selected.id ? { ...a, status: 'running' } : a));
                                            }}
                                            className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                                        >
                                            <Play className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground transition-colors">
                                        <RotateCcw className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            const clone = { ...selected, id: `agent_${Date.now()}`, name: selected.name + ' (Copy)', status: 'idle' as const };
                                            setAgents(prev => [...prev, clone]);
                                        }}
                                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground transition-colors"
                                    >
                                        <Copy className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Stats Row */}
                            <div className="grid grid-cols-3 gap-3">
                                {[
                                    { label: 'Sessions', value: selected.sessionsCount.toLocaleString(), icon: MessageSquare },
                                    { label: 'Tokens Used', value: (selected.tokensUsed / 1000).toFixed(0) + 'K', icon: Zap },
                                    { label: 'Memory', value: selected.memoryScope === 'shared' ? 'Shared' : 'Isolated', icon: Brain },
                                ].map(stat => (
                                    <div key={stat.label} className="bg-white/[0.03] rounded-xl p-3 border border-border/20">
                                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                            <stat.icon className="w-3 h-3" />
                                            <span className="text-[10px] uppercase tracking-wider">{stat.label}</span>
                                        </div>
                                        <p className="text-sm font-semibold">{stat.value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Config Sections */}
                            {[
                                {
                                    key: 'general', label: 'General Configuration', items: [
                                        { k: 'Provider', v: selected.provider },
                                        { k: 'Model', v: selected.model },
                                        { k: 'Persona', v: selected.persona || 'Default' },
                                    ]
                                },
                                {
                                    key: 'tools', label: 'Tool Policy', items: [
                                        { k: 'Policy', v: TOOL_POLICIES[selected.toolPolicy].label },
                                        { k: 'Description', v: TOOL_POLICIES[selected.toolPolicy].desc },
                                    ]
                                },
                                {
                                    key: 'triggers', label: 'Triggers & Channels', items: [
                                        { k: 'Triggers', v: selected.triggers.join(', ') || 'Manual' },
                                        { k: 'Channels', v: selected.channels.join(', ') },
                                    ]
                                },
                            ].map(section => (
                                <div key={section.key} className="rounded-xl border border-border/20 overflow-hidden">
                                    <button
                                        onClick={() => setExpandedSection(expandedSection === section.key ? null : section.key)}
                                        className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
                                    >
                                        <span className="text-xs font-medium">{section.label}</span>
                                        {expandedSection === section.key ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                                    </button>
                                    <AnimatePresence>
                                        {expandedSection === section.key && (
                                            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                                                <div className="px-3 pb-3 space-y-2">
                                                    {section.items.map(item => (
                                                        <div key={item.k} className="flex justify-between items-center py-1.5 border-t border-border/10">
                                                            <span className="text-[11px] text-muted-foreground">{item.k}</span>
                                                            <span className="text-[11px] font-medium">{item.v}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            ))}

                            {/* Danger Zone */}
                            <div className="rounded-xl border border-red-500/20 p-4">
                                <h3 className="text-xs font-semibold text-red-400 mb-3">Danger Zone</h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={async () => {
                                            try {
                                                await kernelBridge.sendAndWait(
                                                    JSON.stringify({ action: 'unregister_agent', agent_id: selected.id }),
                                                    'agent_registry', 10000
                                                );
                                            } catch (e) { /* non-blocking */ }
                                            setAgents(prev => prev.filter(a => a.id !== selected.id));
                                            setSelectedAgent(null);
                                        }}
                                        className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-medium transition-colors flex items-center gap-1.5"
                                    >
                                        <Trash2 className="w-3 h-3" /> Delete Agent
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {view === 'create' && (
                        <motion.div key="create" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-6">
                            <h2 className="text-lg font-semibold flex items-center gap-2 mb-6">
                                <Sparkles className="w-5 h-5 text-primary" />
                                Create New Agent
                            </h2>

                            {/* Wizard Steps */}
                            <div className="flex items-center gap-2 mb-8">
                                {['Identity', 'Model', 'Tools', 'Review'].map((step, i) => (
                                    <React.Fragment key={step}>
                                        <button
                                            onClick={() => setWizardStep(i)}
                                            className={`px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-medium transition-all
                                                ${wizardStep === i ? 'bg-primary text-primary-foreground' : wizardStep > i ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-muted-foreground'}`}
                                        >
                                            {step}
                                        </button>
                                        {i < 3 && <div className={`flex-1 h-px ${wizardStep > i ? 'bg-emerald-500/40' : 'bg-border/30'}`} />}
                                    </React.Fragment>
                                ))}
                            </div>

                            {/* Step Content */}
                            <AnimatePresence mode="wait">
                                {wizardStep === 0 && (
                                    <motion.div key="step0" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                                        <div>
                                            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Agent Name</label>
                                            <input
                                                value={newAgent.name || ''}
                                                onChange={e => setNewAgent({ ...newAgent, name: e.target.value })}
                                                placeholder="e.g., Research Assistant"
                                                className="w-full bg-white/5 border border-border/30 rounded-xl px-4 py-2.5 text-sm placeholder-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Description</label>
                                            <textarea
                                                value={newAgent.description || ''}
                                                onChange={e => setNewAgent({ ...newAgent, description: e.target.value })}
                                                placeholder="What does this agent do?"
                                                rows={3}
                                                className="w-full bg-white/5 border border-border/30 rounded-xl px-4 py-2.5 text-sm placeholder-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors resize-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Avatar Emoji</label>
                                            <div className="flex gap-2 flex-wrap">
                                                {['🤖', '🧠', '🔍', '⚙️', '🛡️', '📊', '💻', '🎨', '📝', '🚀'].map(emoji => (
                                                    <button
                                                        key={emoji}
                                                        onClick={() => setNewAgent({ ...newAgent, avatar: emoji })}
                                                        className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition-all
                                                            ${newAgent.avatar === emoji ? 'bg-primary/20 border-2 border-primary' : 'bg-white/5 border border-border/30 hover:bg-white/10'}`}
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {wizardStep === 1 && (
                                    <motion.div key="step1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                                        <div>
                                            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">AI Provider</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {PROVIDERS.map(p => (
                                                    <button
                                                        key={p}
                                                        onClick={() => setNewAgent({ ...newAgent, provider: p, model: MODELS[p][0] })}
                                                        className={`p-3 rounded-xl text-xs font-medium transition-all
                                                            ${newAgent.provider === p ? 'bg-primary/15 border-2 border-primary text-primary' : 'bg-white/5 border border-border/30 hover:bg-white/10'}`}
                                                    >
                                                        {p}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Model</label>
                                            <div className="space-y-1.5">
                                                {(MODELS[newAgent.provider || 'Groq'] || []).map(m => (
                                                    <button
                                                        key={m}
                                                        onClick={() => setNewAgent({ ...newAgent, model: m })}
                                                        className={`w-full text-left p-3 rounded-xl text-xs font-mono transition-all
                                                            ${newAgent.model === m ? 'bg-primary/15 border border-primary/30 text-primary' : 'bg-white/5 border border-border/20 hover:bg-white/10'}`}
                                                    >
                                                        {m}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Memory Scope</label>
                                            <div className="flex gap-2">
                                                {(['shared', 'isolated'] as const).map(scope => (
                                                    <button
                                                        key={scope}
                                                        onClick={() => setNewAgent({ ...newAgent, memoryScope: scope })}
                                                        className={`flex-1 p-3 rounded-xl text-xs font-medium capitalize transition-all
                                                            ${newAgent.memoryScope === scope ? 'bg-primary/15 border border-primary/30 text-primary' : 'bg-white/5 border border-border/20 hover:bg-white/10'}`}
                                                    >
                                                        <Brain className="w-4 h-4 mb-1 mx-auto" />
                                                        {scope}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {wizardStep === 2 && (
                                    <motion.div key="step2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                                        <div>
                                            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2 block">Tool Policy</label>
                                            <div className="space-y-2">
                                                {(Object.entries(TOOL_POLICIES) as [string, any][]).map(([key, policy]) => (
                                                    <button
                                                        key={key}
                                                        onClick={() => setNewAgent({ ...newAgent, toolPolicy: key as any })}
                                                        className={`w-full flex items-center gap-3 p-4 rounded-xl text-left transition-all
                                                            ${newAgent.toolPolicy === key ? 'bg-primary/10 border-2 border-primary/30' : 'bg-white/5 border border-border/20 hover:bg-white/10'}`}
                                                    >
                                                        <policy.icon className={`w-5 h-5 ${policy.color}`} />
                                                        <div>
                                                            <p className="text-xs font-semibold">{policy.label}</p>
                                                            <p className="text-[10px] text-muted-foreground mt-0.5">{policy.desc}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Channels</label>
                                            <div className="flex gap-2 flex-wrap">
                                                {['chat', 'voice', 'cli', 'whatsapp', 'discord', 'telegram'].map(ch => (
                                                    <button
                                                        key={ch}
                                                        onClick={() => {
                                                            const channels = newAgent.channels || [];
                                                            setNewAgent({
                                                                ...newAgent,
                                                                channels: channels.includes(ch) ? channels.filter(c => c !== ch) : [...channels, ch],
                                                            });
                                                        }}
                                                        className={`px-3 py-1.5 rounded-lg text-[10px] capitalize font-medium transition-all
                                                            ${(newAgent.channels || []).includes(ch) ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-white/5 border border-border/20 hover:bg-white/10'}`}
                                                    >
                                                        {ch}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {wizardStep === 3 && (
                                    <motion.div key="step3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                                        <div className="bg-white/[0.03] rounded-xl p-5 border border-border/20 space-y-3">
                                            <h3 className="text-sm font-semibold">Review Configuration</h3>
                                            {[
                                                ['Name', newAgent.name || 'Unnamed'],
                                                ['Avatar', newAgent.avatar || '🤖'],
                                                ['Provider', newAgent.provider || 'Groq'],
                                                ['Model', newAgent.model || 'llama-3.3-70b'],
                                                ['Tool Policy', TOOL_POLICIES[(newAgent.toolPolicy as keyof typeof TOOL_POLICIES) || 'minimal'].label],
                                                ['Memory', newAgent.memoryScope || 'shared'],
                                                ['Channels', (newAgent.channels || []).join(', ')],
                                            ].map(([k, v]) => (
                                                <div key={k} className="flex justify-between items-center py-1.5 border-b border-border/10 last:border-0">
                                                    <span className="text-[11px] text-muted-foreground">{k}</span>
                                                    <span className="text-[11px] font-medium">{v}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Navigation */}
                            <div className="flex justify-between mt-8">
                                <button
                                    onClick={() => setWizardStep(Math.max(0, wizardStep - 1))}
                                    disabled={wizardStep === 0}
                                    className="px-4 py-2 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-colors"
                                >
                                    Back
                                </button>
                                {wizardStep < 3 ? (
                                    <button
                                        onClick={() => setWizardStep(wizardStep + 1)}
                                        className="px-4 py-2 rounded-xl text-xs font-medium bg-primary/20 hover:bg-primary/30 text-primary transition-colors"
                                    >
                                        Next
                                    </button>
                                ) : (
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={handleCreateAgent}
                                        className="px-6 py-2.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-colors flex items-center gap-2"
                                    >
                                        <Sparkles className="w-3.5 h-3.5" />
                                        Create Agent
                                    </motion.button>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {view === 'canvas' && (
                        <AgentCanvas
                            agents={agents}
                            connections={layout.connections}
                            onConnectionsChange={(conns) => setLayout(prev => ({ ...prev, connections: conns }))}
                            nodePositions={layout.positions}
                            onNodePositionsChange={(pos) => setLayout(prev => ({ ...prev, positions: pos }))}
                        />
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
