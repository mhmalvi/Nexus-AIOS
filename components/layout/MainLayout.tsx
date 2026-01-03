import React, { useState, useEffect, useRef } from "react";
import { Header } from "./Header";
import { StatusBar } from "./StatusBar";
import { Dock } from "./Dock";
import { ThoughtStream } from "../agent/ThoughtStream";
import { CommandInput } from "../command/CommandInput";
import { CommandPalette } from "../command/CommandPalette";
import { MemoryViewer } from "../agent/MemoryViewer";
import { WarRoom } from "../agent/WarRoom";
import { SwarmCluster } from "../agent/SwarmCluster";
import { SystemTerminal } from "../tools/SystemTerminal";
import { FileManager } from "../tools/FileManager";
import { SettingsPanel } from "../tools/SettingsPanel";
import { WebBrowser } from "../tools/WebBrowser";
import { CodeEditor } from "../tools/CodeEditor";
import { Scheduler } from "../tools/Scheduler";
import { NotificationCenter } from "./NotificationCenter";
import { SummaryOverlay } from "./SummaryOverlay";
import { useStore } from "../../context/StoreContext";
import { User, Bot, Terminal, Code, Globe, Search, Maximize2, Minimize2, X, Minus, Layout, Layers, Settings, Users, ArrowDownRight, Pin, Folder, FileCode, Calendar } from "lucide-react";
import { motion, AnimatePresence, useDragControls, PanInfo } from "framer-motion";

const WindowFrame = ({ id, title, icon: Icon, children, width: defaultWidth, height: defaultHeight, windowState, onClose, onMinimize, onMaximize, onFocus, onSnap, onResize, onMove, onToggleAlwaysOnTop, activeWindowId, focusMode, constraintsRef }: any) => {
    if (!windowState || !windowState.isOpen) return null;
    if (focusMode && activeWindowId !== id) return null;

    const HEADER_HEIGHT = 40; 
    
    // Position Logic
    const currentX = windowState.position?.x ?? (id === 'chat' ? 80 : 250);
    const currentY = windowState.position?.y ?? (id === 'chat' ? 80 : 100);
    const currentWidth = windowState.size?.width || defaultWidth;
    const currentHeight = windowState.size?.height || defaultHeight;

    const [isResizing, setIsResizing] = useState(false);
    const dragControls = useDragControls();
    const isActive = activeWindowId === id;
    
    // Determine if interactive
    const isDraggable = !windowState.isMaximized && !windowState.snap && !focusMode && !windowState.isMinimized;

    // Resize Logic
    const handleResizeStart = (direction: 'corner' | 'right' | 'bottom') => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onFocus(id); 
        setIsResizing(true);

        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = typeof currentWidth === 'string' ? parseInt(currentWidth) : currentWidth;
        const startHeight = typeof currentHeight === 'string' ? parseInt(currentHeight) : currentHeight;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (focusMode || windowState.isMaximized || windowState.snap) return;

            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;

            let newWidth = startWidth;
            let newHeight = startHeight;

            if (direction === 'right' || direction === 'corner') {
                newWidth = Math.max(300, startWidth + deltaX);
            }
            if (direction === 'bottom' || direction === 'corner') {
                newHeight = Math.max(200, startHeight + deltaY);
            }

            onResize(id, newWidth, newHeight);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    // Calculate Target Animation State based on Window Status
    const getTargetState = () => {
        // 1. Minimized
        if (windowState.isMinimized) {
            return {
                position: 'absolute',
                opacity: 0,
                scale: 0.5,
                y: typeof window !== 'undefined' ? window.innerHeight + 200 : 1000,
                x: currentX, // Maintain X to drop down
                transition: { duration: 0.4, ease: [0.32, 0.72, 0, 1] }
            };
        }

        // 2. Focus Mode (Zen) - Centered
        if (focusMode) {
             return { 
                 position: 'fixed',
                 x: "-50%", 
                 y: "-50%",
                 top: "50%",
                 left: "50%",
                 width: "min(90vw, 1200px)", 
                 height: "min(85vh, 900px)", 
                 borderRadius: '16px',
                 boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 100vw rgba(0,0,0,0.5)', // Dim background
                 scale: 1,
                 opacity: 1,
                 zIndex: 9999
             };
        } 

        // 3. Snapped / Maximized
        const screenW = typeof window !== 'undefined' ? window.innerWidth : 1920;
        const screenH = typeof window !== 'undefined' ? window.innerHeight : 1080;
        const margin = 8;
        const snapHeight = screenH - HEADER_HEIGHT - margin * 2;

        if (windowState.isMaximized || windowState.snap === 'top') {
            return { 
                position: 'absolute',
                x: 0, 
                y: 0,
                left: margin, 
                top: HEADER_HEIGHT + margin,
                width: screenW - (margin * 2), 
                height: snapHeight, 
                borderRadius: '8px',
                scale: 1,
                opacity: 1,
                boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
                zIndex: windowState.isAlwaysOnTop ? windowState.zIndex + 2000 : windowState.zIndex
            };
        } 
        
        if (windowState.snap === 'left') {
            return { 
                position: 'absolute',
                x: 0, 
                y: 0,
                left: margin,
                top: HEADER_HEIGHT + margin,
                width: (screenW / 2) - (margin * 1.5), 
                height: snapHeight, 
                borderRadius: '8px',
                scale: 1,
                opacity: 1,
                boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
                zIndex: windowState.isAlwaysOnTop ? windowState.zIndex + 2000 : windowState.zIndex
            };
        } 
        
        if (windowState.snap === 'right') {
            return { 
                position: 'absolute',
                x: 0, 
                y: 0,
                left: (screenW / 2) + (margin * 0.5),
                top: HEADER_HEIGHT + margin,
                width: (screenW / 2) - (margin * 1.5), 
                height: snapHeight, 
                borderRadius: '8px',
                scale: 1,
                opacity: 1,
                boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
                zIndex: windowState.isAlwaysOnTop ? windowState.zIndex + 2000 : windowState.zIndex
            };
        }

        // 4. Default Floating State
        return {
            position: 'absolute',
            opacity: 1,
            scale: 1,
            x: currentX,
            y: currentY,
            left: 0, 
            top: 0,
            width: currentWidth,
            height: currentHeight,
            borderRadius: "12px",
            zIndex: windowState.isAlwaysOnTop ? windowState.zIndex + 2000 : windowState.zIndex,
            boxShadow: isActive 
                ? "0 20px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(var(--primary), 0.3)" // Active Glow
                : "0 4px 12px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,255,255,0.05)",
            transition: { 
                type: "spring", 
                stiffness: 300, 
                damping: 30 
            }
        };
    };

    const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        if (isDraggable) {
            const newX = currentX + info.offset.x;
            const newY = currentY + info.offset.y;
            onMove(id, newX, newY);
            
            // Snap Logic on Drop
            const x = info.point.x;
            const y = info.point.y;
            const screenW = window.innerWidth;
            const SNAP_THRESHOLD = 50;

            if (y < SNAP_THRESHOLD) onSnap(id, 'top');
            else if (x < SNAP_THRESHOLD) onSnap(id, 'left');
            else if (x > screenW - SNAP_THRESHOLD) onSnap(id, 'right');
        }
    };

    return (
        <motion.div
            key={id}
            initial={false}
            animate={getTargetState()}
            drag={isDraggable}
            dragControls={dragControls}
            dragListener={false} 
            dragConstraints={constraintsRef}
            dragMomentum={true}
            dragTransition={{ power: isActive ? 0.3 : 0.2, timeConstant: isActive ? 250 : 200 }}
            dragElastic={isActive ? 0.2 : 0.05}
            onDragStart={() => onFocus(id)}
            onDragEnd={handleDragEnd}
            whileDrag={{ 
                scale: 1.01,
                zIndex: 9999, // Temp z-index during drag
                boxShadow: "0 30px 60px -15px rgba(0,0,0,0.5)",
                cursor: "grabbing"
            }}
            onPointerDown={() => onFocus(id)}
            className={`flex flex-col glass-panel overflow-hidden
                ${(windowState.snap || windowState.isMaximized || focusMode) ? '' : 'rounded-xl'}
                ${isActive 
                    ? 'bg-background/80 backdrop-blur-2xl ring-1 ring-primary/40' 
                    : 'bg-background/40 backdrop-blur-md border-white/5 opacity-90 hover:opacity-100'}
                ${focusMode ? 'shadow-2xl !border-none' : ''}
                ${isResizing ? 'pointer-events-none select-none transition-none' : ''} 
            `}
        >
            {/* Window Header */}
            {!focusMode && (
                <div 
                    className={`h-10 shrink-0 flex items-center justify-between px-3 select-none border-b transition-colors duration-200
                        ${isActive 
                            ? 'bg-muted/40 border-primary/10 text-foreground' 
                            : 'bg-transparent border-border/40 text-muted-foreground'}
                        cursor-grab active:cursor-grabbing
                    `}
                    onPointerDown={(e) => {
                        onFocus(id);
                        if(isDraggable) dragControls.start(e);
                    }}
                    onDoubleClick={() => onSnap(id, windowState.isMaximized ? null : 'top')}
                >
                    <div className="flex items-center gap-3 text-xs font-bold tracking-wide">
                        <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-primary' : 'opacity-70'}`} />
                        <span className="opacity-90">{title}</span>
                    </div>
                    
                    <div className="flex items-center gap-1.5 z-50" onPointerDown={(e) => e.stopPropagation()}>
                        <button 
                            onClick={() => onToggleAlwaysOnTop(id)} 
                            className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${windowState.isAlwaysOnTop ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'}`}
                            title="Always on Top"
                        >
                            <Pin className="w-3 h-3" />
                        </button>
                        <button onClick={() => onMinimize(id)} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"><Minus className="w-3 h-3" /></button>
                        <button onClick={() => onSnap(id, windowState.isMaximized ? null : 'top')} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground">
                            {windowState.isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                        </button>
                        <button onClick={() => onClose(id)} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-destructive hover:text-destructive-foreground transition-colors text-muted-foreground"><X className="w-3 h-3" /></button>
                    </div>
                </div>
            )}
            
            {/* Focus Mode Close Button */}
            {focusMode && (
                 <motion.button 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => onClose(id)} 
                    className="absolute top-4 right-4 z-50 p-2 rounded-full bg-black/40 hover:bg-destructive text-white transition-colors backdrop-blur-md border border-white/10 shadow-lg"
                 >
                    <X className="w-5 h-5" />
                 </motion.button>
            )}

            {/* Content Area */}
            <div className={`flex-1 overflow-hidden relative ${isResizing ? 'pointer-events-none' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
                {/* Dim overlay for inactive windows */}
                {!isActive && !focusMode && (
                    <div className="absolute inset-0 bg-background/10 backdrop-blur-[1px] pointer-events-none z-10 transition-all duration-300" />
                )}
                {children}
            </div>

            {/* Resize Handles */}
            {isDraggable && (
                <>
                    {/* Right */}
                    <div className="absolute top-0 bottom-6 right-0 w-2 cursor-ew-resize hover:bg-primary/20 transition-colors z-40" onMouseDown={handleResizeStart('right')} />
                    {/* Bottom */}
                    <div className="absolute bottom-0 left-0 right-6 h-2 cursor-ns-resize hover:bg-primary/20 transition-colors z-40" onMouseDown={handleResizeStart('bottom')} />
                    
                    {/* Corner */}
                    <div 
                        className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-50 group flex items-end justify-end p-1" 
                        onMouseDown={handleResizeStart('corner')}
                    >
                        <div className={`w-3 h-3 rounded-sm transition-all duration-300 bg-border group-hover:bg-primary group-hover:scale-125 ${isActive ? 'opacity-100' : 'opacity-50'}`} />
                    </div>
                </>
            )}
        </motion.div>
    );
};

export function MainLayout() {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  
  const { 
      activeConversation, artifacts, closeArtifact, windows, closeWindow, minimizeWindow, maximizeWindow, focusWindow, 
      ui, setAccentColor, activeWindowId, setCommandPaletteOpen, openWindow, snapWindow, setVoiceSettings, resizeWindow, moveWindow, toggleAlwaysOnTop
  } = useStore();
  
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const constraintsRef = React.useRef(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === '/') {
            e.preventDefault();
            openWindow('settings'); 
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openWindow]);

  const getToolIcon = (tool?: string) => {
    switch(tool) {
        case 'terminal': return <Terminal className="w-3 h-3" />;
        case 'browser': return <Globe className="w-3 h-3" />;
        case 'search': return <Search className="w-3 h-3" />;
        case 'code': return <Code className="w-3 h-3" />;
        default: return null;
    }
  };

  const colors = [
      { name: 'Electric Blue', value: '#007AFF' },
      { name: 'Neon Purple', value: '#BF5AF2' },
      { name: 'Cyber Green', value: '#32D74B' },
      { name: 'Alert Orange', value: '#FF9F0A' },
      { name: 'Crimson Red', value: '#FF3B30' },
      { name: 'Mono', value: '#71717a' },
  ];

  return (
    <div className="fixed inset-0 bg-background overflow-hidden font-sans text-foreground selection:bg-primary/20 transition-colors duration-500">
      
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
         <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[120px] rounded-full dark:opacity-30" />
         <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[100px] rounded-full dark:opacity-20" />
         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02]" />
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

      <CommandPalette />
      <NotificationCenter isOpen={isNotificationsOpen} onClose={() => setIsNotificationsOpen(false)} />
      <SummaryOverlay isOpen={isSummaryOpen} onClose={() => setIsSummaryOpen(false)} activeWindowId={activeWindowId} />
      
      <Header 
          onToggleNotifications={() => setIsNotificationsOpen(!isNotificationsOpen)} 
          onSummarize={() => setIsSummaryOpen(true)}
      />

      {/* Main Desktop Area */}
      <main className="absolute top-0 bottom-0 left-0 right-0 z-10" ref={constraintsRef}>
        
        <div className="relative w-full h-full">
            {/* Ambient Artifacts (Canvas Mode) */}
            <AnimatePresence>
                {!ui.focusMode && artifacts.map((artifact, i) => (
                    <motion.div 
                        key={artifact.id}
                        drag
                        dragConstraints={constraintsRef}
                        dragMomentum={false}
                        whileDrag={{ scale: 1.05, cursor: 'grabbing', zIndex: 100 }}
                        initial={{ opacity: 0, scale: 0.8, y: 50, rotateX: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20 }}
                        className={`absolute rounded-2xl overflow-hidden glass-panel shadow-2xl z-[60]`}
                        style={{
                            top: `${15 + (i * 5)}%`,
                            left: `${35 + (i * 4)}%`,
                            width: '550px',
                            height: '420px',
                        }}
                    >
                         <div className="h-10 bg-white/5 border-b border-white/10 flex items-center justify-between px-4 cursor-move backdrop-blur-xl">
                            <div className="flex items-center gap-2 text-xs font-bold text-foreground/80">
                                <Code className="w-3 h-3 text-primary" />
                                <span className="opacity-90 tracking-wide uppercase">{artifact.title}</span>
                            </div>
                            <button className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors" onClick={() => closeArtifact(artifact.id)}>
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                        <div className="h-full bg-black/40 p-0 overflow-auto pb-10">
                            {artifact.type === 'code' ? (
                                <pre className="text-xs font-mono text-zinc-300 leading-relaxed p-4">
                                    {artifact.content}
                                </pre>
                            ) : (
                                <div className="text-sm text-foreground p-6">{artifact.content}</div>
                            )}
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>

            {/* Windows */}
            <AnimatePresence>
            <WindowFrame constraintsRef={constraintsRef} id="chat" title="Nexus Communicator" icon={Bot} width={450} height={600} windowState={windows['chat']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow} onSnap={snapWindow} onResize={resizeWindow} onMove={moveWindow} onToggleAlwaysOnTop={toggleAlwaysOnTop} activeWindowId={activeWindowId} focusMode={ui.focusMode}>
                 <div className="flex flex-col h-full">
                    <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-4 scrollbar-hide">
                        {activeConversation.map((msg) => (
                            <motion.div 
                                key={msg.id} 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`flex gap-3 group ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-1 border border-border ${
                                    msg.role === 'user' ? 'bg-secondary text-secondary-foreground' : 'bg-primary/20 text-primary'
                                }`}>
                                    {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                                </div>
                                <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className={`px-4 py-2.5 rounded-lg text-sm leading-relaxed shadow-sm border ${
                                        msg.role === 'user' 
                                        ? 'bg-secondary border-border text-foreground' 
                                        : 'bg-card border-border text-foreground'
                                    }`}>
                                        <div className="whitespace-pre-wrap">{msg.content}</div>
                                        {msg.role === 'assistant' && msg.tool && (
                                            <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-2 text-[10px] text-muted-foreground">
                                                {getToolIcon(msg.tool)}
                                                <span className="uppercase tracking-wider">{msg.tool} output</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                    <div className="p-4 bg-background/50 border-t border-border/50">
                        <CommandInput />
                    </div>
                 </div>
            </WindowFrame>

            <WindowFrame constraintsRef={constraintsRef} id="war-room" title="Mission Control" icon={Layout} width={900} height={650} windowState={windows['war-room']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow} onSnap={snapWindow} onResize={resizeWindow} onMove={moveWindow} onToggleAlwaysOnTop={toggleAlwaysOnTop} activeWindowId={activeWindowId} focusMode={ui.focusMode}>
                <WarRoom />
            </WindowFrame>

            <WindowFrame constraintsRef={constraintsRef} id="memory" title="Memory Core" icon={Layers} width={900} height={650} windowState={windows['memory']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow} onSnap={snapWindow} onResize={resizeWindow} onMove={moveWindow} onToggleAlwaysOnTop={toggleAlwaysOnTop} activeWindowId={activeWindowId} focusMode={ui.focusMode}>
                <MemoryViewer />
            </WindowFrame>

             <WindowFrame constraintsRef={constraintsRef} id="agents" title="Swarm Cluster" icon={Users} width={800} height={600} windowState={windows['agents']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow} onSnap={snapWindow} onResize={resizeWindow} onMove={moveWindow} onToggleAlwaysOnTop={toggleAlwaysOnTop} activeWindowId={activeWindowId} focusMode={ui.focusMode}>
                <SwarmCluster />
            </WindowFrame>
            
             <WindowFrame constraintsRef={constraintsRef} id="settings" title="System Preferences" icon={Settings} width={600} height={650} windowState={windows['settings']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow} onSnap={snapWindow} onResize={resizeWindow} onMove={moveWindow} onToggleAlwaysOnTop={toggleAlwaysOnTop} activeWindowId={activeWindowId} focusMode={ui.focusMode}>
                <SettingsPanel />
            </WindowFrame>

            <WindowFrame constraintsRef={constraintsRef} id="files" title="Data Grid" icon={Folder} width={800} height={500} windowState={windows['files']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow} onSnap={snapWindow} onResize={resizeWindow} onMove={moveWindow} onToggleAlwaysOnTop={toggleAlwaysOnTop} activeWindowId={activeWindowId} focusMode={ui.focusMode}>
                <FileManager />
            </WindowFrame>

            <WindowFrame constraintsRef={constraintsRef} id="browser" title="Quantum Browser" icon={Globe} width={900} height={600} windowState={windows['browser']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow} onSnap={snapWindow} onResize={resizeWindow} onMove={moveWindow} onToggleAlwaysOnTop={toggleAlwaysOnTop} activeWindowId={activeWindowId} focusMode={ui.focusMode}>
                <WebBrowser />
            </WindowFrame>

            <WindowFrame constraintsRef={constraintsRef} id="code" title="Code Forge" icon={FileCode} width={900} height={650} windowState={windows['code']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow} onSnap={snapWindow} onResize={resizeWindow} onMove={moveWindow} onToggleAlwaysOnTop={toggleAlwaysOnTop} activeWindowId={activeWindowId} focusMode={ui.focusMode}>
                <CodeEditor />
            </WindowFrame>

            <WindowFrame constraintsRef={constraintsRef} id="schedule" title="Chronos" icon={Calendar} width={850} height={600} windowState={windows['schedule']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow} onSnap={snapWindow} onResize={resizeWindow} onMove={moveWindow} onToggleAlwaysOnTop={toggleAlwaysOnTop} activeWindowId={activeWindowId} focusMode={ui.focusMode}>
                <Scheduler />
            </WindowFrame>

            <WindowFrame constraintsRef={constraintsRef} id="terminal" title="System Terminal" icon={Terminal} width={700} height={450} windowState={windows['terminal']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow} onSnap={snapWindow} onResize={resizeWindow} onMove={moveWindow} onToggleAlwaysOnTop={toggleAlwaysOnTop} activeWindowId={activeWindowId} focusMode={ui.focusMode}>
                <SystemTerminal />
            </WindowFrame>
            </AnimatePresence>

        </div>
      </main>

      {/* Right Sidebar (Thought Stream) - Hover to Reveal */}
      {!ui.focusMode && (
         <div className="fixed right-0 top-[36px] bottom-0 z-[40] flex flex-row-reverse group pointer-events-none">
             {/* Trigger Zone - always interactable */}
             <div className="w-4 h-full bg-transparent hover:bg-primary/5 cursor-pointer pointer-events-auto transition-colors z-50" />
             
             {/* Sidebar Content - interactable only when 'open' (hovered) */}
             <div className="w-80 h-full glass-panel border-r-0 border-y-0 border-l border-border/50 backdrop-blur-xl translate-x-full opacity-50 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300 ease-out pointer-events-auto overflow-hidden">
                 <ThoughtStream />
             </div>
         </div>
      )}
      
      <Dock />
      <StatusBar />
    </div>
  );
}