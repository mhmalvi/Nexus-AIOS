
import React, { useState, useEffect, useRef } from "react";
import { HEADER_HEIGHT } from "../../services/WindowBounds";
import { Search, Command, Wifi, Battery, Bell, Cpu, Maximize, Sun, Moon, Eye, EyeOff, Lock, Terminal, Activity, BatteryCharging, Volume2 } from "lucide-react";
import { useStore } from "../../context/StoreContext";
import { AetherPulse } from "../ui/AetherPulse";
import { motion, AnimatePresence } from "framer-motion";

interface HeaderProps {
    onToggleNotifications: () => void;
    onSummarize: () => void;
}

export function Header({ onToggleNotifications, onSummarize }: HeaderProps) {
    const { agent, setCommandPaletteOpen, ui, setTheme, notifications, setFocusMode, setLocked, openWindow } = useStore();
    const [time, setTime] = useState(new Date());
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const [isSysTrayOpen, setIsSysTrayOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setActiveMenu(null);
                setIsSysTrayOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            clearInterval(timer);
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const menuItems: Record<string, { label: string, icon?: any, shortcut?: string, action: () => void, divider?: boolean }[]> = {
        'AETHER': [
            { label: 'About AETHER', action: () => { } },
            { label: 'System Preferences...', icon: undefined, action: () => openWindow('settings'), divider: true },
            { label: 'Lock Session', icon: Lock, shortcut: '⌘L', action: () => setLocked(true) },
            { label: 'Restart Session', action: () => window.location.reload() },
        ],
        'File': [
            { label: 'New Chat', shortcut: '⌘N', action: () => openWindow('echoes') },
            { label: 'New Terminal', shortcut: '⌘T', action: () => openWindow('terminal') },
            { label: 'New Agent', action: () => openWindow('agents') },
        ],
        'View': [
            { label: ui.focusMode ? 'Exit Focus Mode' : 'Enter Focus Mode', icon: ui.focusMode ? EyeOff : Eye, shortcut: '⌘⇧F', action: () => setFocusMode(!ui.focusMode) },
            { label: 'Toggle Fullscreen', icon: Maximize, shortcut: '⌃⌘F', action: () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen() },
        ],
        'Tools': [
            { label: 'Command Palette', icon: Command, shortcut: '⌘K', action: () => setCommandPaletteOpen(true) },
            { label: 'Terminal', icon: Terminal, shortcut: '⌘`', action: () => openWindow('terminal') },
            { label: 'Security Audit', action: () => openWindow('security') },
        ],
    };

    const formatDate = () => {
        return time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    const formatTime = () => {
        return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <header
            className="fixed top-0 left-0 right-0 z-[2000] px-3 flex items-center justify-between select-none pointer-events-none"
            style={{ height: HEADER_HEIGHT }}
            ref={menuRef}
        >
            {/* Glass Background — uses semantic tokens */}
            <div className={`absolute inset-0 transition-opacity duration-500 pointer-events-auto
                ${ui.focusMode
                    ? 'opacity-0 pointer-events-none'
                    : 'bg-background/80 backdrop-blur-2xl border-b border-border/50'
                }`}
            />

            {/* ─── Left: Brand + Menu Bar ─── */}
            <div className={`flex items-center gap-1 relative z-10 pointer-events-auto transition-all duration-500 ${ui.focusMode ? 'translate-y-[-100px]' : ''}`}>
                {/* AETHER logo/pulse */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-foreground/[0.06] cursor-pointer transition-colors" onClick={() => setActiveMenu(activeMenu === 'AETHER' ? null : 'AETHER')}>
                    <AetherPulse
                        state={agent.isThinking ? 'thinking' : agent.isListening ? 'action' : 'idle'}
                        size={14}
                        className="transition-transform duration-300"
                    />
                    <span className="font-bold tracking-[0.15em] text-foreground/90 text-[11px]">AETHER</span>
                </div>

                {/* Menu items */}
                <nav className="hidden md:flex items-center">
                    {Object.keys(menuItems).filter(k => k !== 'AETHER').map((key) => (
                        <div key={key} className="relative">
                            <button
                                onClick={() => setActiveMenu(activeMenu === key ? null : key)}
                                className={`px-2.5 py-1 rounded-md text-[12px] font-normal transition-all
                                    ${activeMenu === key
                                        ? 'bg-foreground/[0.12] text-foreground'
                                        : 'text-foreground/60 hover:text-foreground/90 hover:bg-foreground/[0.06]'
                                    }`}
                            >
                                {key}
                            </button>

                            <AnimatePresence>
                                {activeMenu === key && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 4, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                                        transition={{ duration: 0.12 }}
                                        className="absolute top-full left-0 mt-0.5 w-52 bg-popover/95 backdrop-blur-2xl border border-border rounded-lg shadow-2xl p-1 z-50"
                                    >
                                        {menuItems[key].map((item, i) => (
                                            <React.Fragment key={i}>
                                                {item.divider && <div className="h-px bg-border my-1" />}
                                                <button
                                                    onClick={() => { item.action(); setActiveMenu(null); }}
                                                    className="w-full text-left px-2.5 py-1.5 rounded-md flex items-center gap-2 text-[12px] hover:bg-accent transition-colors text-foreground/80 hover:text-foreground"
                                                >
                                                    {item.icon && <item.icon className="w-3.5 h-3.5 opacity-50" />}
                                                    <span className="flex-1">{item.label}</span>
                                                    {item.shortcut && <span className="text-[10px] text-muted-foreground font-mono">{item.shortcut}</span>}
                                                </button>
                                            </React.Fragment>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}

                    {/* AETHER menu dropdown */}
                    <AnimatePresence>
                        {activeMenu === 'AETHER' && (
                            <motion.div
                                initial={{ opacity: 0, y: 4, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                                transition={{ duration: 0.12 }}
                                className="absolute top-full left-0 mt-0.5 w-52 bg-popover/95 backdrop-blur-2xl border border-border rounded-lg shadow-2xl p-1 z-50"
                            >
                                {menuItems['AETHER'].map((item, i) => (
                                    <React.Fragment key={i}>
                                        {item.divider && <div className="h-px bg-border my-1" />}
                                        <button
                                            onClick={() => { item.action(); setActiveMenu(null); }}
                                            className="w-full text-left px-2.5 py-1.5 rounded-md flex items-center gap-2 text-[12px] hover:bg-accent transition-colors text-foreground/80 hover:text-foreground"
                                        >
                                            {item.icon && <item.icon className="w-3.5 h-3.5 opacity-50" />}
                                            <span className="flex-1">{item.label}</span>
                                            {item.shortcut && <span className="text-[10px] text-muted-foreground font-mono">{item.shortcut}</span>}
                                        </button>
                                    </React.Fragment>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </nav>
            </div>

            {/* ─── Center: Focus Mode Toggle ─── */}
            <div className={`absolute top-1 left-1/2 -translate-x-1/2 pointer-events-auto z-20 transition-all duration-500 ${ui.focusMode ? 'translate-y-0' : 'translate-y-[-60px]'}`}>
                <button
                    onClick={() => setFocusMode(false)}
                    className="bg-foreground/[0.08] backdrop-blur-xl border border-border px-3 py-1 rounded-full text-[10px] font-semibold text-foreground/80 flex items-center gap-1.5 hover:bg-foreground/[0.12] transition-all"
                >
                    <EyeOff className="w-3 h-3" />
                    Exit Focus
                </button>
            </div>

            {/* ─── Right: System Tray ─── */}
            <div className={`flex items-center gap-1 relative z-10 pointer-events-auto transition-all duration-500 ${ui.focusMode ? 'translate-y-[-100px]' : ''}`}>

                {/* Quick action buttons */}
                <button onClick={() => setFocusMode(true)} className="p-1.5 rounded-md hover:bg-foreground/[0.06] text-foreground/40 hover:text-foreground/70 transition-all" title="Focus Mode">
                    <Eye className="w-3.5 h-3.5" />
                </button>

                <button onClick={() => setTheme(ui.theme === 'dark' ? 'light' : 'dark')} className="p-1.5 rounded-md hover:bg-foreground/[0.06] text-foreground/40 hover:text-foreground/70 transition-all">
                    {ui.theme === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                </button>

                <button onClick={onToggleNotifications} className="relative p-1.5 rounded-md hover:bg-foreground/[0.06] text-foreground/40 hover:text-foreground/70 transition-all">
                    <Bell className="w-3.5 h-3.5" />
                    {notifications.some(n => !n.read) && (
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-destructive rounded-full animate-pulse" />
                    )}
                </button>

                {/* Separator */}
                <div className="w-px h-3.5 bg-border mx-0.5" />

                {/* Date + Time (macOS-style right corner) */}
                <button
                    onClick={() => setIsSysTrayOpen(!isSysTrayOpen)}
                    className={`flex items-center gap-2.5 text-[11px] font-medium px-2 py-1 rounded-md transition-all
                        ${isSysTrayOpen ? 'bg-foreground/[0.12] text-foreground/90' : 'text-foreground/60 hover:bg-foreground/[0.06] hover:text-foreground/80'}`}
                >
                    <span className="hidden lg:inline text-foreground/40">{formatDate()}</span>
                    <span className="font-semibold text-foreground/80">{formatTime()}</span>
                </button>

                {/* Control Center Popover */}
                <AnimatePresence>
                    {isSysTrayOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.96 }}
                            transition={{ duration: 0.15 }}
                            className="absolute top-full right-0 mt-1 w-72 bg-popover/95 backdrop-blur-2xl border border-border rounded-xl shadow-2xl p-3 z-50"
                        >
                            <div className="space-y-2.5">
                                {/* Row 1: Quick toggles */}
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-accent/50 hover:bg-accent transition-colors cursor-pointer">
                                        <div className="p-1.5 bg-blue-500/20 rounded-lg"><Wifi className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" /></div>
                                        <div className="text-[11px]">
                                            <div className="text-foreground/80 font-medium">Wi-Fi</div>
                                            <div className="text-muted-foreground">Connected</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-accent/50 hover:bg-accent transition-colors cursor-pointer">
                                        <div className="p-1.5 bg-green-500/20 rounded-lg"><Volume2 className="w-3.5 h-3.5 text-green-500 dark:text-green-400" /></div>
                                        <div className="text-[11px]">
                                            <div className="text-foreground/80 font-medium">Sound</div>
                                            <div className="text-muted-foreground">100%</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Row 2: System metrics */}
                                <div className="space-y-1.5 pt-1 border-t border-border">
                                    <div className="flex items-center justify-between px-1">
                                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                            <Cpu className="w-3 h-3" /> CPU
                                        </div>
                                        <span className="text-[11px] text-foreground/70 font-mono">—</span>
                                    </div>
                                    <div className="flex items-center justify-between px-1">
                                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                            <Activity className="w-3 h-3" /> RAM
                                        </div>
                                        <span className="text-[11px] text-foreground/70 font-mono">—</span>
                                    </div>
                                </div>

                                {/* Lock button */}
                                <button
                                    onClick={() => { setLocked(true); setIsSysTrayOpen(false); }}
                                    className="w-full py-2 bg-accent/50 hover:bg-accent rounded-lg text-[11px] font-medium text-foreground/60 hover:text-foreground/80 flex items-center justify-center gap-2 transition-all border border-border/50"
                                >
                                    <Lock className="w-3 h-3" /> Lock Session
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </header>
    );
}
