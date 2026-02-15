
import React, { useState, useEffect, useRef, useCallback } from "react";
import { HEADER_HEIGHT, DOCK_HEIGHT, STATUS_BAR_HEIGHT, getSafeWorkArea, clampWindowPosition } from "../../services/WindowBounds";
import { Header } from "./Header";
import { StatusBar } from "./StatusBar";
import { Dock } from "./Dock";
import { ThoughtStream } from "../agent/ThoughtStream";
import { ChatInterface } from "../chat/ChatInterface";
import { CommandInput } from "../command/CommandInput";
import { CommandPalette } from "../command/CommandPalette";
import { MemoryExplorer } from "../tools/MemoryExplorer";
import { WarRoom } from "../agent/WarRoom";
import { AgentBuilder } from "../tools/AgentBuilder";
import { SecurityCenter } from "../tools/SecurityCenter";
import { SystemTerminal } from "../tools/SystemTerminal";
import { FileManager } from "../tools/FileManager";
import { AetherSanctum } from "../settings/AetherSanctum";
import { WebBrowser } from "../tools/WebBrowser";
import { CodeEditor } from "../tools/CodeEditor";
import { Scheduler } from "../tools/Scheduler";
import { ModuleManager } from "../tools/ModuleManager";
import { ImageViewer } from "../tools/ImageViewer";
import { MessagingDashboard } from "../tools/MessagingDashboard";
import { PluginManager } from "../tools/PluginManager";
import { LockScreen } from "../system/LockScreen";
import { NotificationCenter } from "./NotificationCenter";
import { SummaryOverlay } from "./SummaryOverlay";
import { ContextMenu } from "../ui/ContextMenu";
import { WindowFrame } from "../system/WindowFrame";
import { WindowErrorBoundary } from "../system/ErrorBoundary";
import { DashboardWidget } from "../system/DashboardWidget";
import { useStore } from "../../context/StoreContext";
import { Bot, Terminal, Code, Globe, Search, Layout, Settings, Folder, FileCode, Calendar, Package, Image as ImageIcon, X, Shield, Brain, MessageSquare, Puzzle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function MainLayout() {
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);

    const {
        activeConversation, artifacts, closeArtifact, windows, closeWindow, minimizeWindow, maximizeWindow, focusWindow,
        ui, activeWindowId, setCommandPaletteOpen, openWindow, snapWindow, resizeWindow, moveWindow, toggleAlwaysOnTop
    } = useStore();

    const constraintsRef = React.useRef(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === '/') {
                e.preventDefault();
                openWindow('settings');
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setCommandPaletteOpen(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [openWindow, setCommandPaletteOpen]);

    // Revalidate all window positions when viewport resizes (debounced)
    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout>;
        const handleResize = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                const newW = window.innerWidth;
                const newH = window.innerHeight;
                const workArea = getSafeWorkArea(newW, newH, ui.dockAutoHide);

                Object.entries(windows).forEach(([id, win]) => {
                    if (!win?.isOpen || win.isMinimized || win.isMaximized || win.snap) return;
                    if (!win.position) return;

                    const w = win.size?.width || 800;
                    const h = win.size?.height || 520;
                    const clamped = clampWindowPosition(win.position.x, win.position.y, w, h, newW, newH, ui.dockAutoHide);

                    if (clamped.x !== win.position.x || clamped.y !== win.position.y) {
                        moveWindow(id, clamped.x, clamped.y);
                    }
                });
            }, 150);
        };
        window.addEventListener('resize', handleResize);
        return () => { window.removeEventListener('resize', handleResize); clearTimeout(timeoutId); };
    }, [windows, ui.dockAutoHide, moveWindow]);

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        if (e.target === e.currentTarget || (e.target as HTMLElement).id === "desktop-area") {
            setContextMenu({ x: e.clientX, y: e.clientY });
        }
    };

    // Responsive default window size — adapts to viewport, never exceeds 80% of canvas
    const screenW = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 1080;
    const dockClearance = ui.dockAutoHide ? 0 : DOCK_HEIGHT;
    const canvasH = screenH - HEADER_HEIGHT - dockClearance - STATUS_BAR_HEIGHT;
    const WIN_W = Math.min(800, Math.floor(screenW * 0.8));
    const WIN_H = Math.min(520, Math.floor(canvasH * 0.85));
    const windowDefs: { id: string; title: string; icon: any; width: number; height: number; component: React.ReactNode; variant?: 'default' | 'ghost' }[] = [
        { id: 'echoes', title: 'AETHER Chat', icon: Bot, width: WIN_W, height: WIN_H, component: <ChatInterface />, variant: 'default' },
        { id: 'war-room', title: 'Mission Control', icon: Layout, width: WIN_W, height: WIN_H, component: <WarRoom /> },
        { id: 'agents', title: 'Agent Builder', icon: Bot, width: WIN_W, height: WIN_H, component: <AgentBuilder /> },
        { id: 'security', title: 'Security Center', icon: Shield, width: WIN_W, height: WIN_H, component: <SecurityCenter /> },
        { id: 'memory', title: 'Memory Explorer', icon: Brain, width: WIN_W, height: WIN_H, component: <MemoryExplorer /> },
        { id: 'settings', title: 'Settings', icon: Settings, width: WIN_W, height: WIN_H, component: <AetherSanctum /> },
        { id: 'files', title: 'File Manager', icon: Folder, width: WIN_W, height: WIN_H, component: <FileManager /> },
        { id: 'browser', title: 'Web Browser', icon: Globe, width: WIN_W, height: WIN_H, component: <WebBrowser /> },
        { id: 'code', title: 'Nexus Code', icon: FileCode, width: WIN_W, height: WIN_H, component: <CodeEditor /> },
        { id: 'schedule', title: 'Scheduler', icon: Calendar, width: WIN_W, height: WIN_H, component: <Scheduler /> },
        { id: 'modules', title: 'Module Manager', icon: Package, width: WIN_W, height: WIN_H, component: <ModuleManager /> },
        { id: 'media', title: 'Gallery', icon: ImageIcon, width: WIN_W, height: WIN_H, component: <ImageViewer /> },
        { id: 'terminal', title: 'Terminal', icon: Terminal, width: WIN_W, height: WIN_H, component: <SystemTerminal /> },
        { id: 'messaging', title: 'Messaging', icon: MessageSquare, width: WIN_W, height: WIN_H, component: <MessagingDashboard /> },
        { id: 'plugins', title: 'Plugin Manager', icon: Puzzle, width: WIN_W, height: WIN_H, component: <PluginManager /> },
    ];

    return (
        <div className="fixed inset-0 bg-background [overflow:clip] font-sans text-foreground selection:bg-primary/20 transition-colors duration-500"
            onContextMenu={handleContextMenu}
            onClick={() => setContextMenu(null)}
        >
            {/* Dynamic Background */}
            <div id="desktop-area" className="absolute inset-0 z-0 pointer-events-auto">
                {/* Subtle gradient orbs — simplified for better theme compatibility */}
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/[0.04] blur-[160px] rounded-full pointer-events-none" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-blue-500/[0.03] blur-[140px] rounded-full pointer-events-none" />

                {/* Noise texture */}
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] pointer-events-none mix-blend-overlay" />

                {/* Focus Mode Overlay */}
                <AnimatePresence>
                    {ui.focusMode && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-background/95 backdrop-blur-md z-[90]"
                        />
                    )}
                </AnimatePresence>
            </div>

            <LockScreen />
            <CommandPalette />
            <NotificationCenter isOpen={isNotificationsOpen} onClose={() => setIsNotificationsOpen(false)} />
            <SummaryOverlay isOpen={isSummaryOpen} onClose={() => setIsSummaryOpen(false)} activeWindowId={activeWindowId} />

            <AnimatePresence>
                {contextMenu && (
                    <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} />
                )}
            </AnimatePresence>

            <Header
                onToggleNotifications={() => setIsNotificationsOpen(!isNotificationsOpen)}
                onSummarize={() => setIsSummaryOpen(true)}
            />

            {/* Main Desktop Canvas — strictly positioned between header and statusbar */}
            <main
                className="absolute left-0 right-0 z-0 pointer-events-none [overflow:clip]"
                style={{
                    top: `${HEADER_HEIGHT}px`,
                    height: `calc(100vh - ${HEADER_HEIGHT + (ui.dockAutoHide ? STATUS_BAR_HEIGHT : DOCK_HEIGHT + STATUS_BAR_HEIGHT)}px)`,
                }}
            >
                <div className="relative w-full h-full pointer-events-auto">
                    {/* Ambient Artifacts */}
                    <AnimatePresence>
                        {!ui.focusMode && artifacts.map((artifact, i) => (
                            <motion.div
                                key={artifact.id}
                                drag
                                dragConstraints={constraintsRef}
                                dragMomentum={false}
                                whileDrag={{ scale: 1.03, cursor: 'grabbing', zIndex: 100 }}
                                initial={{ opacity: 0, scale: 0.85, y: 40 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.85 }}
                                transition={{ type: "spring", stiffness: 220, damping: 22 }}
                                className="absolute rounded-xl overflow-hidden shadow-2xl z-[60] bg-card/90 backdrop-blur-xl border border-border"
                                style={{
                                    top: `${12 + (i * 5)}%`,
                                    left: `${32 + (i * 4)}%`,
                                    width: '520px', height: '400px',
                                }}
                            >
                                <div className="h-9 bg-muted/80 border-b border-border flex items-center justify-between px-3 cursor-move backdrop-blur-xl">
                                    <div className="flex items-center gap-2 text-xs font-medium text-foreground/70">
                                        <Code className="w-3 h-3 text-primary" />
                                        <span className="tracking-wide">{artifact.title}</span>
                                    </div>
                                    <button className="w-4 h-4 rounded-full hover:bg-foreground/10 flex items-center justify-center transition-colors" onClick={() => closeArtifact(artifact.id)}>
                                        <X className="w-3 h-3 text-muted-foreground" />
                                    </button>
                                </div>
                                <div className="h-full bg-background/50 p-0 overflow-auto pb-10">
                                    {artifact.type === 'code' ? (
                                        <pre className="text-xs font-mono text-muted-foreground leading-relaxed p-4">
                                            {artifact.content}
                                        </pre>
                                    ) : (
                                        <div className="text-sm text-foreground/80 p-5">{artifact.content}</div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {/* Application Windows */}
                    <AnimatePresence>
                        {windowDefs.map(def => (
                            <WindowFrame
                                key={def.id}
                                constraintsRef={constraintsRef}
                                id={def.id}
                                title={def.title}
                                icon={def.icon}
                                width={def.width}
                                height={def.height}
                                windowState={windows[def.id]}
                                onClose={closeWindow}
                                onMinimize={minimizeWindow}
                                onMaximize={maximizeWindow}
                                onFocus={focusWindow}
                                onSnap={snapWindow}
                                onResize={resizeWindow}
                                onMove={moveWindow}
                                onToggleAlwaysOnTop={toggleAlwaysOnTop}
                                activeWindowId={activeWindowId}
                                focusMode={ui.focusMode}
                                variant={def.variant || 'default'}
                            >
                                <WindowErrorBoundary windowId={def.id}>
                                    {def.component}
                                </WindowErrorBoundary>
                            </WindowFrame>
                        ))}
                    </AnimatePresence>
                </div>
            </main>

            {/* Right Sidebar (Thought Stream) — hover to reveal */}
            {!ui.focusMode && (
                <div className="fixed right-0 top-[40px] bottom-0 z-[40] flex flex-row-reverse group pointer-events-none">
                    <div className="w-3 h-full bg-transparent hover:bg-primary/5 cursor-pointer pointer-events-auto transition-colors z-50" />
                    <div className="w-72 h-full bg-card/95 backdrop-blur-xl border-l border-border translate-x-full opacity-50 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300 ease-out pointer-events-auto overflow-hidden shadow-2xl">
                        <ThoughtStream />
                    </div>
                </div>
            )}

            <Dock />
            <StatusBar />
        </div>
    );
}
