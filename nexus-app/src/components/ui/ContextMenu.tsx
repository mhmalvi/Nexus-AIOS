
import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Terminal, LayoutGrid, Eye, Image, LogOut, Moon, Sun, Monitor, Cpu } from 'lucide-react';
import { useStore } from '../../context/StoreContext';

interface ContextMenuProps {
    x: number;
    y: number;
    onClose: () => void;
}

export function ContextMenu({ x, y, onClose }: ContextMenuProps) {
    const { openWindow, setFocusMode, ui, setTheme, addThought } = useStore();
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, [onClose]);

    const handleAction = (action: () => void, label: string) => {
        action();
        onClose();
        // Optional: Log action as a thought for immersion
        if (label !== 'Theme') {
            addThought({
                id: Date.now().toString(),
                timestamp: new Date(),
                type: 'action',
                component: 'scheduler',
                content: `User initiated context action: ${label}`
            });
        }
    };

    // Adjust position if close to edge
    const adjustedX = x + 200 > window.innerWidth ? x - 200 : x;
    const adjustedY = y + 250 > window.innerHeight ? y - 250 : y;

    return (
        <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            style={{ top: adjustedY, left: adjustedX }}
            className="fixed z-[9999] w-52 bg-background/80 backdrop-blur-2xl border border-border/50 rounded-xl shadow-2xl p-1.5 overflow-hidden flex flex-col gap-1"
        >
            <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border/30 mb-1">
                Nexus OS System
            </div>

            <MenuItem icon={Terminal} label="New Terminal" onClick={() => handleAction(() => openWindow('terminal'), 'New Terminal')} />
            <MenuItem icon={Cpu} label="System Monitor" onClick={() => handleAction(() => openWindow('settings'), 'System Monitor')} />

            <div className="h-px bg-border/40 my-1" />

            <MenuItem icon={LayoutGrid} label="Reset Layout" onClick={() => handleAction(() => { localStorage.removeItem('nexus_windows_v14'); window.location.reload(); }, 'Reset Layout')} />
            <MenuItem icon={ui.focusMode ? Eye : Eye} label={ui.focusMode ? "Exit Focus" : "Focus Mode"} onClick={() => handleAction(() => setFocusMode(!ui.focusMode), 'Toggle Focus')} />

            <div className="h-px bg-border/40 my-1" />

            <MenuItem
                icon={ui.theme === 'dark' ? Sun : Moon}
                label={ui.theme === 'dark' ? "Light Mode" : "Dark Mode"}
                onClick={() => handleAction(() => setTheme(ui.theme === 'dark' ? 'light' : 'dark'), 'Theme')}
            />
            <MenuItem icon={Image} label="Change Wallpaper" onClick={() => handleAction(() => { }, 'Change Wallpaper')} disabled />

            <div className="h-px bg-border/40 my-1" />

            <MenuItem icon={LogOut} label="End Session" onClick={() => handleAction(() => window.location.reload(), 'End Session')} danger />
        </motion.div>
    );
}

function MenuItem({ icon: Icon, label, onClick, danger, disabled }: any) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary/10 hover:text-primary'}
                ${danger ? 'text-red-500 hover:bg-red-500/10 hover:text-red-600' : 'text-foreground/80'}
            `}
        >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
        </button>
    );
}
