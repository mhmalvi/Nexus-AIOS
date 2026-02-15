
import React, { useState, useRef, useCallback, useEffect } from "react";
import { MessageSquare, Layout, Globe, FileCode, Folder, Terminal, Bot, Shield, Brain, Package, Calendar, Settings, Mic, Image as ImageIcon, Puzzle } from "lucide-react";
import { useStore } from "../../context/StoreContext";
import { motion, useMotionValue, useTransform, useSpring, AnimatePresence } from "framer-motion";
import { useSound } from "../../hooks/useSound";
import { DOCK_HEIGHT, STATUS_BAR_HEIGHT } from "../../services/WindowBounds";

interface DockItem {
    id: string;
    icon: any;
    label: string;
    color: string;
}

const DOCK_ITEMS: DockItem[] = [
    { id: 'echoes', icon: MessageSquare, label: 'AETHER Chat', color: '#60A5FA' },
    { id: 'browser', icon: Globe, label: 'Web Browser', color: '#34D399' },
    { id: 'code', icon: FileCode, label: 'Nexus Code', color: '#A78BFA' },
    { id: 'files', icon: Folder, label: 'File Manager', color: '#FBBF24' },
    { id: 'terminal', icon: Terminal, label: 'Terminal', color: '#6EE7B7' },
    { id: 'war-room', icon: Layout, label: 'Mission Control', color: '#F87171' },
    { id: 'agents', icon: Bot, label: 'Agent Builder', color: '#818CF8' },
    { id: 'security', icon: Shield, label: 'Security Center', color: '#FB923C' },
    { id: 'memory', icon: Brain, label: 'Memory Explorer', color: '#E879F9' },
    { id: 'modules', icon: Package, label: 'Module Manager', color: '#38BDF8' },
    { id: 'schedule', icon: Calendar, label: 'Scheduler', color: '#FB7185' },
    { id: 'messaging', icon: MessageSquare, label: 'Messaging', color: '#10B981' },
    { id: 'plugins', icon: Puzzle, label: 'Plugins', color: '#F472B6' },
    { id: 'media', icon: ImageIcon, label: 'Gallery', color: '#2DD4BF' },
    { id: 'settings', icon: Settings, label: 'Settings', color: '#94A3B8' },
];

/**
 * A single dock icon with macOS-style magnification.
 */
function DockIcon({
    item, mouseX, isOpen, isActive,
    onClick, onHover,
}: {
    item: DockItem;
    mouseX: ReturnType<typeof useMotionValue>;
    isOpen: boolean;
    isActive: boolean;
    onClick: () => void;
    onHover: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);

    const distance = useTransform(mouseX, (val: number) => {
        const el = ref.current;
        if (!el || val === -999) return 200;
        const rect = el.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        return Math.abs(val - center);
    });

    const baseSize = 46;
    const maxScale = 1.45;
    const magnifyRange = 140;

    const scale = useTransform(distance, [0, magnifyRange], [maxScale, 1]);
    const smoothScale = useSpring(scale, { stiffness: 300, damping: 22, mass: 0.5 });
    const smoothY = useTransform(smoothScale, [1, maxScale], [0, -10]);

    return (
        <div ref={ref} className="relative flex flex-col items-center">
            <motion.button
                onClick={onClick}
                onMouseEnter={onHover}
                style={{ scale: smoothScale, y: smoothY }}
                whileTap={{ scale: 0.85 }}
                aria-label={item.label}
                className={`
                    relative flex items-center justify-center rounded-[12px] transition-colors duration-200
                    ${isActive
                        ? 'bg-foreground/15 shadow-lg'
                        : 'bg-foreground/[0.06] hover:bg-foreground/[0.10]'
                    }
                `}
            >
                <div style={{ width: baseSize, height: baseSize }} className="flex items-center justify-center">
                    <item.icon
                        className="w-[22px] h-[22px] transition-colors duration-200"
                        style={{ color: isActive ? item.color : undefined }}
                        strokeWidth={1.6}
                    />
                    {!isActive && (
                        <style>{`.dark .dock-icon-${item.id} { color: rgba(255,255,255,0.55) }`}</style>
                    )}
                </div>

                {isActive && (
                    <div
                        className="absolute inset-0 rounded-[12px] opacity-20 blur-sm pointer-events-none"
                        style={{ background: `radial-gradient(circle, ${item.color}40, transparent 70%)` }}
                    />
                )}
            </motion.button>

            {/* Running indicator dot */}
            {isOpen && (
                <motion.div
                    layoutId={`dock-indicator-${item.id}`}
                    className="absolute -bottom-[5px]"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                >
                    <div
                        className="w-[4px] h-[4px] rounded-full"
                        style={{ backgroundColor: isActive ? item.color : undefined }}
                    />
                    {!isActive && (
                        <div className="w-[4px] h-[4px] rounded-full absolute inset-0 bg-muted-foreground" />
                    )}
                </motion.div>
            )}

            {/* Tooltip */}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover/iconwrap:opacity-100 transition-all duration-150 pointer-events-none whitespace-nowrap z-[200]">
                <div className="px-2.5 py-1 bg-popover/95 text-popover-foreground text-[11px] font-medium rounded-lg border border-border backdrop-blur-md shadow-xl">
                    {item.label}
                </div>
            </div>
        </div>
    );
}

/* ─── Main Dock Component ─── */
export function Dock() {
    const { windows, focusWindow, openWindow, activeWindowId, minimizeWindow, ui, agent, startListening, stopListening } = useStore();
    const { play } = useSound();

    const mouseX = useMotionValue(-999);
    const [isDockVisible, setIsDockVisible] = useState(!ui.dockAutoHide);
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync visibility when auto-hide setting changes
    useEffect(() => {
        if (!ui.dockAutoHide) {
            setIsDockVisible(true);
        } else {
            setIsDockVisible(false);
        }
    }, [ui.dockAutoHide]);

    const handleHoverZoneEnter = useCallback(() => {
        if (!ui.dockAutoHide) return;
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
        setIsDockVisible(true);
    }, [ui.dockAutoHide]);

    const handleDockLeave = useCallback(() => {
        mouseX.set(-999);
        if (!ui.dockAutoHide) return;
        hideTimeoutRef.current = setTimeout(() => {
            setIsDockVisible(false);
        }, 400);
    }, [mouseX, ui.dockAutoHide]);

    const handleDockEnter = useCallback(() => {
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        mouseX.set(e.clientX);
    }, [mouseX]);

    const handleAppClick = useCallback(async (id: string) => {
        play('open');

        // Nexus Code: try VS Code Server first, fall back to Monaco editor
        if (id === 'code' && !windows[id]?.isOpen) {
            try {
                const { launchNexusCode } = await import("../../services/codeServerService");
                const launched = await launchNexusCode();
                if (launched) return; // VS Code opened in its own window
            } catch (e) {
                console.warn('VS Code Server unavailable, using built-in editor:', e);
            }
            // Fallback: open Monaco-based editor in app window
            openWindow(id);
            return;
        }

        if (!windows[id]?.isOpen) {
            openWindow(id);
        } else {
            if (activeWindowId === id && !windows[id].isMinimized) {
                minimizeWindow(id);
            } else {
                focusWindow(id);
            }
        }
    }, [play, windows, openWindow, activeWindowId, minimizeWindow, focusWindow]);

    const handleVoiceToggle = useCallback(() => {
        play('click');
        if (agent.isListening) stopListening();
        else startListening();
    }, [play, agent.isListening, stopListening, startListening]);

    if (ui.focusMode) return null;

    return (
        <>
            {/* Invisible hover trigger zone at the bottom — only when auto-hide is on */}
            {ui.dockAutoHide && (
                <div
                    className="fixed left-0 right-0 z-[89]"
                    style={{ bottom: STATUS_BAR_HEIGHT, height: 8 }}
                    onMouseEnter={handleHoverZoneEnter}
                />
            )}

            {/* Dock container */}
            <motion.div
                className="fixed left-0 right-0 z-[90] flex justify-center items-end pb-[6px] pointer-events-none"
                style={{ bottom: STATUS_BAR_HEIGHT }}
                initial={false}
                animate={{
                    y: isDockVisible ? 0 : DOCK_HEIGHT + 20,
                    opacity: isDockVisible ? 1 : 0,
                }}
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                onMouseEnter={handleDockEnter}
                onMouseLeave={handleDockLeave}
            >
                {/* Floating Dock Container */}
                <motion.div
                    className="pointer-events-auto flex items-end gap-[3px] px-2.5 py-1.5 rounded-2xl
                        bg-background/80 backdrop-blur-2xl
                        border border-border/60
                        shadow-[0_8px_32px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
                    onMouseMove={handleMouseMove}
                >
                    {/* App Icons */}
                    {DOCK_ITEMS.map((item) => (
                        <div key={item.id} className="group/iconwrap">
                            <DockIcon
                                item={item}
                                mouseX={mouseX}
                                isOpen={!!windows[item.id]?.isOpen}
                                isActive={activeWindowId === item.id}
                                onClick={() => handleAppClick(item.id)}
                                onHover={() => play('hover')}
                            />
                        </div>
                    ))}

                    {/* Divider */}
                    <div className="w-px h-8 bg-border mx-1 self-center" />

                    {/* Voice Button */}
                    <div className="group/iconwrap relative flex flex-col items-center">
                        <motion.button
                            onClick={handleVoiceToggle}
                            whileHover={{ scale: 1.1, y: -4 }}
                            whileTap={{ scale: 0.85 }}
                            className={`w-[46px] h-[46px] rounded-[12px] flex items-center justify-center transition-all duration-200 relative overflow-hidden
                                ${agent.isListening
                                    ? 'bg-destructive text-destructive-foreground shadow-[0_0_20px_rgba(239,68,68,0.5)]'
                                    : 'bg-foreground/[0.06] text-muted-foreground hover:bg-foreground/[0.10] hover:text-foreground/80'
                                }`}
                        >
                            {agent.isListening && (
                                <span className="absolute inset-0 rounded-[12px] bg-destructive/50 animate-ping" />
                            )}
                            <Mic className={`w-[22px] h-[22px] relative z-10 ${agent.isListening ? 'animate-pulse' : ''}`} strokeWidth={1.6} />
                        </motion.button>
                        {/* Tooltip */}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover/iconwrap:opacity-100 transition-all duration-150 pointer-events-none whitespace-nowrap z-[200]">
                            <div className="px-2.5 py-1 bg-popover/95 text-popover-foreground text-[11px] font-medium rounded-lg border border-border backdrop-blur-md shadow-xl">
                                {agent.isListening ? 'Stop Listening' : 'Voice Input'}
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </>
    );
}
