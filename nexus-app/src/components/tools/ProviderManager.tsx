import React, { useState, useEffect } from 'react';
import { Cpu, Cloud, Key, Check, Loader2, RefreshCw, Save, Star, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { useModelConfig, modelConfig, PROVIDER_DEFAULT_MODEL, PROVIDER_MODEL_CATALOG } from '../../services/modelConfig';

interface CloudProvider {
    id: string;
    label: string;
    hint: string;
    url: string;
}

const CLOUD_PROVIDERS: CloudProvider[] = [
    { id: 'groq', label: 'Groq', hint: 'llama-3.3-70b · very fast, free tier', url: 'https://console.groq.com/keys' },
    { id: 'openai', label: 'OpenAI', hint: 'gpt-4o-mini and others', url: 'https://platform.openai.com/api-keys' },
    { id: 'anthropic', label: 'Anthropic (Claude)', hint: 'claude-sonnet / haiku', url: 'https://console.anthropic.com/settings/keys' },
    { id: 'cerebras', label: 'Cerebras', hint: 'llama-3.3-70b · fast', url: 'https://cloud.cerebras.ai/' },
    { id: 'mistral', label: 'Mistral', hint: 'mistral-small / large', url: 'https://console.mistral.ai/api-keys' },
    { id: 'gemini', label: 'Google Gemini', hint: 'gemini-2.5 / 2.0 flash & pro', url: 'https://aistudio.google.com/apikey' },
    { id: 'openrouter', label: 'OpenRouter', hint: 'gateway to many models', url: 'https://openrouter.ai/keys' },
];

export function ProviderManager() {
    const { addNotification } = useStore();
    const mc = useModelConfig();
    const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
    const [modelInputs, setModelInputs] = useState<Record<string, string>>({});
    const [customMode, setCustomMode] = useState<Record<string, boolean>>({});
    const [revealed, setRevealed] = useState<Record<string, boolean>>({});
    const [savingKey, setSavingKey] = useState<string | null>(null);
    const [busyProvider, setBusyProvider] = useState<string | null>(null);

    useEffect(() => { modelConfig.refresh(); }, []);

    const saveKey = async (provider: string) => {
        const key = (keyInputs[provider] || '').trim();
        if (!key) return;
        setSavingKey(provider);
        try {
            await modelConfig.saveKey(provider, key);
            addNotification({ type: 'success', title: 'API Key Saved', message: `${provider} key stored (encrypted at rest).` });
            setKeyInputs(prev => ({ ...prev, [provider]: '' }));
        } catch (e: any) {
            addNotification({ type: 'error', title: 'Save Failed', message: String(e?.message || e) });
        } finally {
            setSavingKey(null);
        }
    };

    const selectProvider = async (provider: string) => {
        if (provider !== 'ollama' && !mc.providersWithKeys.includes(provider)) {
            addNotification({ type: 'warning', title: 'API Key Required', message: `Add a ${provider} API key below before selecting it.` });
            return;
        }
        setBusyProvider(provider);
        try {
            await modelConfig.setProvider(provider);
            addNotification({ type: 'success', title: 'Provider Updated', message: provider === 'ollama' ? 'Using local Ollama engine.' : `Now preferring ${provider}.` });
        } catch (e: any) {
            addNotification({ type: 'error', title: 'Update Failed', message: String(e?.message || e) });
        } finally {
            setBusyProvider(null);
        }
    };

    const setLocalModel = async (model: string) => {
        if (!model) return;
        try {
            await modelConfig.setLocalModel(model);
            addNotification({ type: 'success', title: 'Active Model Set', message: `Local chat model: ${model}` });
        } catch (e: any) {
            addNotification({ type: 'error', title: 'Failed', message: String(e?.message || e) });
        }
    };

    const saveModelValue = async (provider: string, model: string) => {
        try {
            await modelConfig.setProviderModel(provider, model);
            addNotification({ type: 'success', title: 'Model Set', message: model.trim() ? `${provider} → ${model.trim()}` : `${provider} reset to default` });
        } catch (e: any) {
            addNotification({ type: 'error', title: 'Failed', message: String(e?.message || e) });
        }
    };

    if (!mc.loaded) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    const localActive = mc.aiProvider === 'ollama';
    const localModels = mc.installedModels.filter(m => !m.includes('embed'));

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-foreground">
            {/* Local engine — primary */}
            <section className={`rounded-xl border p-4 ${localActive ? 'bg-green-500/5 border-green-500/30' : 'bg-card border-border'}`}>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-green-500/10 text-green-500"><Cpu className="w-4 h-4" /></div>
                        <div>
                            <h3 className="font-bold text-sm flex items-center gap-1.5 text-foreground">
                                Local Engine (Ollama)
                                <span className="text-[9px] font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Star className="w-2.5 h-2.5" /> RECOMMENDED</span>
                            </h3>
                            <p className="text-[10px] text-muted-foreground">Private · runs on your machine · no API key needed</p>
                        </div>
                    </div>
                    <button
                        onClick={() => selectProvider('ollama')}
                        disabled={localActive || busyProvider === 'ollama'}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${localActive ? 'bg-green-500/15 text-green-500 cursor-default' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
                    >
                        {localActive ? <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Active</span> : busyProvider === 'ollama' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Use Local'}
                    </button>
                </div>

                <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1.5">Active chat model</label>
                <div className="flex gap-2">
                    <select
                        value={mc.activeModel}
                        onChange={(e) => setLocalModel(e.target.value)}
                        className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                    >
                        {localModels.length === 0 && <option value="">No models installed — see Local Models tab</option>}
                        {mc.activeModel && !localModels.includes(mc.activeModel) && <option value={mc.activeModel}>{mc.activeModel}</option>}
                        {localModels.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <button onClick={() => modelConfig.refresh()} className="p-2 rounded-lg border border-border hover:bg-muted/50 text-muted-foreground" title="Refresh">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">Install more models from the <span className="font-medium text-foreground/70">Local Models</span> tab.</p>
            </section>

            {/* Cloud providers — optional */}
            <section>
                <div className="flex items-center gap-2 mb-2">
                    <Cloud className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-bold text-sm text-foreground">Third-Party Providers</h3>
                    <span className="text-[10px] text-muted-foreground">optional — add a key to enable</span>
                </div>
                <div className="space-y-2.5">
                    {CLOUD_PROVIDERS.map(p => {
                        const configured = mc.providersWithKeys.includes(p.id);
                        const active = mc.aiProvider === p.id;
                        const current = mc.providerModels[p.id] || '';
                        const catalog = PROVIDER_MODEL_CATALOG[p.id] || [];
                        return (
                            <div key={p.id} className={`rounded-xl border p-3 ${active ? 'bg-primary/5 border-primary/30' : 'bg-card border-border'}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <Key className="w-3.5 h-3.5 text-muted-foreground" />
                                        <span className="font-semibold text-sm text-foreground">{p.label}</span>
                                        {configured && <span className="text-[9px] font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Check className="w-2.5 h-2.5" /> KEY SET</span>}
                                        {active && <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">ACTIVE</span>}
                                    </div>
                                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1">Get key <ExternalLink className="w-3 h-3" /></a>
                                </div>
                                <p className="text-[10px] text-muted-foreground mb-2">{p.hint}</p>
                                <div className="flex gap-2">
                                    <div className="flex-1 relative">
                                        <input
                                            type={revealed[p.id] ? 'text' : 'password'}
                                            value={keyInputs[p.id] || ''}
                                            onChange={(e) => setKeyInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                                            placeholder={configured ? '•••••••• (saved — enter to replace)' : `Paste ${p.label} API key`}
                                            className="w-full bg-muted/30 border border-border rounded-lg pl-3 pr-9 py-1.5 text-sm font-mono text-foreground focus:outline-none focus:border-primary"
                                        />
                                        <button type="button" onClick={() => setRevealed(prev => ({ ...prev, [p.id]: !prev[p.id] }))} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                            {revealed[p.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                    <button onClick={() => saveKey(p.id)} disabled={!(keyInputs[p.id] || '').trim() || savingKey === p.id} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/70 disabled:opacity-40 flex items-center gap-1.5 text-foreground">
                                        {savingKey === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                                    </button>
                                    <button onClick={() => selectProvider(p.id)} disabled={active || busyProvider === p.id}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${active ? 'bg-primary/15 text-primary cursor-default' : configured ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted/50 text-muted-foreground'}`}
                                        title={configured ? 'Prefer this provider' : 'Add a key first'}>
                                        {active ? 'Active' : busyProvider === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Use'}
                                    </button>
                                </div>

                                {/* Model / version picker */}
                                {customMode[p.id] ? (
                                    <div className="flex gap-2 mt-2">
                                        <input
                                            autoFocus
                                            value={modelInputs[p.id] ?? current}
                                            onChange={(e) => setModelInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                                            onBlur={() => { saveModelValue(p.id, modelInputs[p.id] ?? ''); setCustomMode(prev => ({ ...prev, [p.id]: false })); }}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { saveModelValue(p.id, modelInputs[p.id] ?? ''); setCustomMode(prev => ({ ...prev, [p.id]: false })); } }}
                                            placeholder="Custom model id (e.g. gemini-2.5-pro)"
                                            className="flex-1 bg-muted/20 border border-border rounded-lg px-3 py-1.5 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary"
                                        />
                                        <button onClick={() => setCustomMode(prev => ({ ...prev, [p.id]: false }))} className="px-2 rounded-lg text-[11px] text-muted-foreground hover:bg-muted/50">Cancel</button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="text-[10px] text-muted-foreground shrink-0">Model</span>
                                        <select
                                            value={catalog.includes(current) ? current : (current ? '__current__' : '')}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                if (v === '__custom__') { setModelInputs(prev => ({ ...prev, [p.id]: current })); setCustomMode(prev => ({ ...prev, [p.id]: true })); }
                                                else if (v !== '__current__') { saveModelValue(p.id, v); }
                                            }}
                                            className="flex-1 bg-muted/20 border border-border rounded-lg px-2 py-1.5 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary cursor-pointer"
                                        >
                                            <option value="">Default · {PROVIDER_DEFAULT_MODEL[p.id] || 'provider default'}</option>
                                            {catalog.map(m => <option key={m} value={m}>{m}</option>)}
                                            {current && !catalog.includes(current) && <option value="__current__">{current} (current)</option>}
                                            <option value="__custom__">✎ Custom…</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
                    Keys are stored encrypted on this machine and sent only to the provider you select.
                    The system stays <span className="text-green-500 font-medium">local-first</span> — cloud providers are used only when you pick one above.
                </p>
            </section>
        </div>
    );
}
