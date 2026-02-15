
import React, { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mic, Activity, Database, Lock, Sun, Moon, Palette, Keyboard, ChevronDown, ChevronUp, PanelBottomClose, Brain, Key } from "lucide-react";
import { useStore } from "../../context/StoreContext";
import { systemApi } from "../../services/tauriApi";

const ACCENT_COLORS = [
    { name: 'Cyan', value: '#00D4FF' },
    { name: 'Green', value: '#00FF88' },
    { name: 'Purple', value: '#8B5CF6' },
    { name: 'Orange', value: '#FF6B35' },
    { name: 'Pink', value: '#EC4899' },
    { name: 'Blue', value: '#3B82F6' },
];

const SHORTCUTS = [
    { key: 'Ctrl+K', action: 'Open Command Palette' },
    { key: 'Ctrl+/', action: 'Toggle Focus Mode' },
    { key: 'Ctrl+\\', action: 'Toggle Terminal' },
    { key: 'Esc', action: 'Close Active Window' },
    { key: 'Ctrl+N', action: 'New Chat' },
    { key: 'Ctrl+M', action: 'Toggle Microphone' },
];

export function AetherSanctum() {
    const { ui, setAccentColor, setFocusMode, setTheme, setDockAutoHide } = useStore();

    // Module states
    const [perceptionLevel, setPerceptionLevel] = useState(100);
    const [resonance, setResonance] = useState({ x: 50, y: 50 });
    const [retention, setRetention] = useState<'ephemeral' | 'eternal'>('ephemeral');
    const [shortcutsOpen, setShortcutsOpen] = useState(false);

    const handlePerceptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value);
        setPerceptionLevel(val);
        systemApi.updateConfig({ privacy_level: val });
    };

    const handleRetentionChange = (policy: 'ephemeral' | 'eternal') => {
        setRetention(policy);
        systemApi.updateConfig({ memory_retention_policy: policy });
    };

    const handleThemeToggle = () => {
        const newTheme = ui.theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
        try { localStorage.setItem('nexus_theme', newTheme); } catch (e) { }
    };

    const handleAccentChange = (color: string) => {
        setAccentColor(color);
        document.documentElement.style.setProperty('--primary', color);
        try { localStorage.setItem('nexus_accent', color); } catch (e) { }
    };

    return (
        <div className="h-full bg-background/50 backdrop-blur-3xl text-foreground p-8 font-sans overflow-y-auto scrollbar-hide">
            <h2 className="text-3xl font-light mb-10 tracking-[0.2em] text-center text-foreground/80">THE SANCTUM</h2>

            <div className="space-y-12 max-w-lg mx-auto">

                {/* THEME TOGGLE */}
                <section className="space-y-4">
                    <div className="text-sm uppercase tracking-widest text-muted-foreground">Appearance</div>
                    <div className="flex gap-4">
                        <button
                            onClick={handleThemeToggle}
                            className={`flex-1 h-20 rounded-xl border flex items-center justify-center gap-3 transition-all ${ui.theme === 'dark'
                                ? 'bg-card border-primary text-primary shadow-lg ring-1 ring-primary/20'
                                : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted/60'
                                }`}
                        >
                            <Moon className="w-5 h-5" />
                            <span className="text-xs tracking-widest uppercase">Dark</span>
                        </button>
                        <button
                            onClick={handleThemeToggle}
                            className={`flex-1 h-20 rounded-xl border flex items-center justify-center gap-3 transition-all ${ui.theme === 'light'
                                ? 'bg-card border-primary text-primary shadow-lg ring-1 ring-primary/20'
                                : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted/60'
                                }`}
                        >
                            <Sun className="w-5 h-5" />
                            <span className="text-xs tracking-widest uppercase">Light</span>
                        </button>
                    </div>
                </section>

                {/* ACCENT COLOR */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between text-sm uppercase tracking-widest text-muted-foreground">
                        <span>Accent Color</span>
                        <Palette className="w-4 h-4" />
                    </div>
                    <div className="flex gap-3 flex-wrap">
                        {ACCENT_COLORS.map(color => (
                            <button
                                key={color.value}
                                onClick={() => handleAccentChange(color.value)}
                                className={`w-10 h-10 rounded-full border-2 transition-all hover:scale-110 ${ui.accentColor === color.value ? 'border-primary ring-2 ring-primary/30' : 'border-transparent'
                                    }`}
                                style={{ backgroundColor: color.value }}
                                title={color.name}
                            />
                        ))}
                    </div>
                </section>

                {/* DOCK PREFERENCES */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between text-sm uppercase tracking-widest text-muted-foreground">
                        <span>Dock</span>
                        <PanelBottomClose className="w-4 h-4" />
                    </div>
                    <div
                        className="flex items-center justify-between bg-muted/30 rounded-xl border border-border p-4 cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => setDockAutoHide(!ui.dockAutoHide)}
                    >
                        <div>
                            <div className="text-sm font-medium text-foreground">Auto-Hide Dock</div>
                            <div className="text-xs text-muted-foreground mt-0.5">Dock hides automatically and reveals on hover</div>
                        </div>
                        <div className={`w-11 h-6 rounded-full transition-colors duration-200 relative ${ui.dockAutoHide ? 'bg-primary' : 'bg-muted-foreground/30'
                            }`}>
                            <motion.div
                                className="absolute top-0.5 w-5 h-5 bg-background rounded-full shadow-md"
                                animate={{ left: ui.dockAutoHide ? 22 : 2 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            />
                        </div>
                    </div>
                </section>

                {/* PERCEPTION (Privacy) */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between text-sm uppercase tracking-widest text-muted-foreground">
                        <span>Perception Field</span>
                        <span>{perceptionLevel}%</span>
                    </div>
                    <div className="relative h-16 bg-muted/30 rounded-full border border-border flex items-center px-6 overflow-hidden group">
                        <div className="absolute inset-0 bg-primary/5 transition-opacity" style={{ opacity: perceptionLevel / 100 }} />
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={perceptionLevel}
                            onChange={handlePerceptionChange}
                            className="w-full h-full opacity-0 absolute inset-0 cursor-ew-resize z-20"
                        />
                        <div className="w-full h-1 bg-border rounded-full overflow-hidden relative z-10">
                            <motion.div className="h-full bg-primary shadow-[0_0_15px_var(--primary)]" style={{ width: `${perceptionLevel}%` }} />
                        </div>
                        <div className="absolute right-6 z-10">
                            {perceptionLevel === 0 ? <EyeOff className="text-destructive w-5 h-5" /> : <Eye className="text-primary w-5 h-5" />}
                        </div>
                    </div>
                </section>

                {/* MEMORY RETENTION */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between text-sm uppercase tracking-widest text-muted-foreground">
                        <span>Retention Protocol</span>
                        <Database className="w-4 h-4" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => handleRetentionChange('ephemeral')}
                            className={`h-20 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${retention === 'ephemeral'
                                ? 'bg-primary/10 border-primary text-primary'
                                : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50'
                                }`}
                        >
                            <Activity className="w-5 h-5" />
                            <span className="text-xs tracking-widest uppercase">Ephemeral</span>
                        </button>
                        <button
                            onClick={() => handleRetentionChange('eternal')}
                            className={`h-20 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${retention === 'eternal'
                                ? 'bg-purple-500/10 border-purple-500 text-purple-400'
                                : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50'
                                }`}
                        >
                            <Lock className="w-5 h-5" />
                            <span className="text-xs tracking-widest uppercase">Eternal</span>
                        </button>
                    </div>
                </section>

                {/* KEYBOARD SHORTCUTS */}
                <section className="space-y-4">
                    <button
                        onClick={() => setShortcutsOpen(!shortcutsOpen)}
                        className="w-full flex items-center justify-between text-sm uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <Keyboard className="w-4 h-4" />
                            <span>Keyboard Shortcuts</span>
                        </div>
                        {shortcutsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {shortcutsOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            className="bg-muted/30 rounded-xl border border-border p-4 space-y-2 overflow-hidden"
                        >
                            {SHORTCUTS.map(s => (
                                <div key={s.key} className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">{s.action}</span>
                                    <kbd className="px-2 py-1 bg-background border border-border rounded text-xs font-mono text-primary font-bold shadow-sm">{s.key}</kbd>
                                </div>
                            ))}
                        </motion.div>
                    )}
                </section>

                {/* INTELLIGENCE (API Keys) */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between text-sm uppercase tracking-widest text-muted-foreground">
                        <span>Intelligence</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground/70">CLOUD CONNECT</span>
                            <Brain className="w-4 h-4" />
                        </div>
                    </div>

                    <div className="grid gap-3">
                        {['openai', 'anthropic', 'groq', 'cerebras', 'mistral', 'gemini'].map((provider) => (
                            <div key={provider} className="flex items-center gap-3 p-3 bg-muted/20 rounded-xl border border-border/50 hover:bg-muted/30 transition-colors group">
                                <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center border border-border shadow-sm">
                                    <Key className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
                                        {provider}
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="password"
                                            placeholder={`Enter ${provider} API Key`}
                                            className="w-full bg-transparent border-none text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none h-6"
                                            onChange={(e) => {
                                                // Auto-save on change with debounce could be nice, but simple onBlur is safer
                                                const val = e.target.value;
                                                if (val.trim().length > 10) {
                                                    systemApi.updateConfig({
                                                        api_keys: { [provider]: val.trim() }
                                                    });
                                                }
                                            }}
                                        />
                                        <div className="w-2 h-2 rounded-full bg-green-500/20 shadow-[0_0_5px_rgba(34,197,94,0.2)]" title="Key Saved (Simulated)" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground/50 italic text-center">
                        Keys are encrypted and stored locally in your secure vault.
                    </p>
                </section>

                {/* VOICE XY PAD (Mini) */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between text-sm uppercase tracking-widest text-muted-foreground">
                        <span>Resonance</span>
                        <Mic className="w-4 h-4" />
                    </div>
                    <div className="aspect-video w-full bg-muted/20 rounded-2xl border border-border relative overflow-hidden group hover:border-primary/30 transition-colors">
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:20px_20px] opacity-10" />
                        <motion.div
                            drag
                            dragMomentum={false}
                            dragConstraints={{ left: 0, right: 300, top: 0, bottom: 150 }}
                            className="absolute w-8 h-8 rounded-full bg-primary/20 border border-primary shadow-[0_0_20px_var(--primary)] cursor-grab active:cursor-grabbing flex items-center justify-center top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                        >
                            <div className="w-2 h-2 bg-background rounded-full" />
                        </motion.div>
                        <div className="absolute bottom-2 right-4 text-[10px] text-muted-foreground font-mono">
                            WARMTH [X] / PRECISION [Y]
                        </div>
                    </div>
                </section>

                <div className="pt-8 text-center">
                    <p className="text-[10px] text-muted-foreground/40 tracking-[0.3em] font-mono">NEXUS AIOS // v3.1.0 // BUILD 9420</p>
                </div>

            </div>
        </div>
    );
}
