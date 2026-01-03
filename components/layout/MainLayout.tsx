
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
import { NotificationCenter } from "./NotificationCenter";
import { SummaryOverlay } from "./SummaryOverlay";
import { useStore } from "../../context/StoreContext";
import { User, Bot, Terminal, Code, Globe, Search, Maximize2, Minimize2, X, Minus, Layout, Layers, Settings, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const WindowFrame = ({ id, title, icon: Icon, children, width, height, windowState, onClose, onMinimize, onMaximize, onFocus, onSnap, activeWindowId, focusMode, constraintsRef }: any) => {
    if (!windowState || !windowState.isOpen) return null;
    // In focus mode, strictly only show the active window
    if (focusMode && activeWindowId !== id) return null;

    // Adjusted offsets
    const HEADER_HEIGHT = 40; 
    
    const initialX = id === 'chat' ? 80 : 250;
    const initialY = id === 'chat' ? 80 : 100;

    // Define the target animation state based on window mode
    let targetAnim: any = {
        opacity: windowState.isMinimized ? 0 : 1,
        scale: windowState.isMinimized ? 0.8 : 1,
        filter: windowState.isMinimized ? "blur(20px)" : "blur(0px)",
        borderRadius: "12px",
    };

    if (focusMode) {
         // ZEN MODE: Centered, large, focused
         targetAnim = { 
             ...targetAnim, 
             top: '50%', 
             left: '50%', 
             x: '-50%', 
             y: '-50%', 
             width: '90vw', 
             height: '90vh', 
             position: 'fixed', 
             zIndex: 100,
             borderRadius: '16px',
             boxShadow: '0 0 0 100vmax rgba(0,0,0,0.85)' // Dim everything else
         };
    } else if (windowState.isMaximized || windowState.snap === 'top') {
        // MAXIMIZED / TOP SNAP: Fill workspace minus header
        targetAnim = { 
            ...targetAnim, 
            top: HEADER_HEIGHT + 10, 
            left: 10, 
            right: 10, 
            bottom: 10, 
            width: 'calc(100vw - 20px)', 
            height: 'calc(100vh - 60px)', // Account for header + margin
            borderRadius: '8px',
            x: 0, y: 0 
        };
    } else if (windowState.snap === 'left') {
        // LEFT SPLIT
        targetAnim = { 
            ...targetAnim, 
            top: HEADER_HEIGHT + 10, 
            left: 10, 
            width: 'calc(50vw - 15px)', 
            height: 'calc(100vh - 60px)', 
            borderRadius: '8px',
            x: 0, y: 0
        };
    } else if (windowState.snap === 'right') {
        // RIGHT SPLIT
        targetAnim = { 
            ...targetAnim, 
            top: HEADER_HEIGHT + 10, 
            left: '50%', 
            width: 'calc(50vw - 15px)', 
            height: 'calc(100vh - 60px)', 
            borderRadius: '8px',
            x: 5, y: 0 // Small offset for gap
        };
    }

    const handleDragEnd = (event: any, info: any) => {
        if (focusMode) return;
        
        const x = event.clientX;
        const y = event.clientY;
        const screenW = window.innerWidth;
        const SNAP_THRESHOLD = 50;

        // Reset if dragging happens (though dragging is usually disabled when snapped)
        // This handles the drop logic
        if (y < SNAP_THRESHOLD) {
            onSnap(id, 'top');
        } else if (x < SNAP_THRESHOLD) {
            onSnap(id, 'left');
        } else if (x > screenW - SNAP_THRESHOLD) {
            onSnap(id, 'right');
        } else if (windowState.snap || windowState.isMaximized) {
            // If we were snapped and dragged away (if enabled), unsnap
            onSnap(id, null);
        }
    };

    return (
        <motion.div
            key={id}
            layout
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={targetAnim}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            drag={!windowState.isMaximized && !windowState.snap && !focusMode}
            dragConstraints={constraintsRef}
            dragMomentum={false}
            dragElastic={0.05}
            onDragEnd={handleDragEnd}
            transition={{
                layout: { type: "spring", stiffness: 300, damping: 28 },
                opacity: { duration: 0.2 }
            }}
            className={`absolute flex flex-col glass-panel shadow-2xl overflow-hidden
                ${(windowState.snap || windowState.isMaximized || focusMode) ? '' : 'rounded-xl'}
                ${activeWindowId === id ? 'ring-1 ring-primary/40 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.3)]' : 'grayscale-[0.3] opacity-90'}
                ${focusMode ? 'shadow-[0_0_100px_rgba(0,0,0,0.5)] border-white/20' : ''}
            `}
            style={{ 
                zIndex: windowState.zIndex,
                // Apply manual positioning only if not snapped/maximized/focused
                left: (!windowState.snap && !windowState.isMaximized && !focusMode) ? initialX : undefined,
                top: (!windowState.snap && !windowState.isMaximized && !focusMode) ? initialY : undefined,
                width: (!windowState.snap && !windowState.isMaximized && !focusMode) ? width : undefined,
                height: (!windowState.snap && !windowState.isMaximized && !focusMode) ? height : undefined,
                pointerEvents: windowState.isMinimized ? 'none' : 'auto',
            }}
            onMouseDown={() => onFocus(id)}
        >
            {!focusMode && (
                <div 
                    className={`h-10 shrink-0 flex items-center justify-between px-3 select-none border-b border-border/50
                        ${activeWindowId === id ? 'bg-secondary/40' : 'bg-secondary/10'}
                    `}
                    onDoubleClick={() => onSnap(id, windowState.isMaximized ? null : 'top')}
                >
                    <div className="flex items-center gap-3 text-xs font-bold tracking-wide text-foreground/80">
                        <Icon className="w-3.5 h-3.5 opacity-70" />
                        <span>{title}</span>
                    </div>
                    
                    <div className="flex items-center gap-2 z-50" onPointerDown={(e) => e.stopPropagation()}>
                        <button onClick={() => onMinimize(id)} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"><Minus className="w-3 h-3" /></button>
                        <button onClick={() => onSnap(id, windowState.isMaximized ? null : 'top')} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                            {windowState.isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                        </button>
                        <button onClick={() => onClose(id)} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-destructive hover:text-destructive-foreground transition-colors text-muted-foreground"><X className="w-3 h-3" /></button>
                    </div>
                </div>
            )}
            
            {/* Focus Mode Close Button */}
            {focusMode && (
                 <button 
                    onClick={() => onClose(id)} 
                    className="absolute top-4 right-4 z-50 p-2 rounded-full bg-black/50 hover:bg-red-500/80 text-white transition-colors"
                 >
                    <X className="w-5 h-5" />
                 </button>
            )}

            <div className="flex-1 overflow-hidden relative bg-background/40 backdrop-blur-sm" onPointerDown={(e) => e.stopPropagation()}>
                {children}
            </div>
        </motion.div>
    );
};

export function MainLayout() {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  
  const { 
      activeConversation, artifacts, closeArtifact, windows, closeWindow, minimizeWindow, maximizeWindow, focusWindow, 
      ui, setAccentColor, activeWindowId, setCommandPaletteOpen, openWindow, snapWindow, setVoiceSettings
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
         {ui.focusMode && <div className="absolute inset-0 bg-background/95 backdrop-blur-md transition-all duration-700 z-[90]" />}
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
            <WindowFrame constraintsRef={constraintsRef} id="chat" title="Nexus Communicator" icon={Bot} width="450px" height="600px" windowState={windows['chat']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow} onSnap={snapWindow} activeWindowId={activeWindowId} focusMode={ui.focusMode}>
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

            <WindowFrame constraintsRef={constraintsRef} id="war-room" title="Mission Control" icon={Layout} width="900px" height="650px" windowState={windows['war-room']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow} onSnap={snapWindow} activeWindowId={activeWindowId} focusMode={ui.focusMode}>
                <WarRoom />
            </WindowFrame>

            <WindowFrame constraintsRef={constraintsRef} id="memory" title="Memory Core" icon={Layers} width="900px" height="650px" windowState={windows['memory']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow} onSnap={snapWindow} activeWindowId={activeWindowId} focusMode={ui.focusMode}>
                <MemoryViewer />
            </WindowFrame>

             <WindowFrame constraintsRef={constraintsRef} id="agents" title="Swarm Cluster" icon={Users} width="800px" height="600px" windowState={windows['agents']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow} onSnap={snapWindow} activeWindowId={activeWindowId} focusMode={ui.focusMode}>
                <SwarmCluster />
            </WindowFrame>
            
             <WindowFrame constraintsRef={constraintsRef} id="settings" title="System Preferences" icon={Settings} width="600px" height="650px" windowState={windows['settings']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow} onSnap={snapWindow} activeWindowId={activeWindowId} focusMode={ui.focusMode}>
                <div className="p-6 space-y-8 h-full overflow-y-auto">
                    <section>
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Appearance</h3>
                        <div className="space-y-4">
                            <div className="bg-card/50 p-4 rounded-lg border border-border space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-foreground">Interface Theme</span>
                                    <div className="flex gap-2">
                                        <span className="text-xs text-muted-foreground">Managed via Command Deck</span>
                                    </div>
                                </div>
                                <div className="pt-4 border-t border-border">
                                    <span className="text-sm font-medium mb-3 block text-foreground">Accent Color</span>
                                    <div className="flex gap-3">
                                        {colors.map((c) => (
                                            <button
                                                key={c.value}
                                                onClick={() => setAccentColor(c.value)}
                                                className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${ui.accentColor === c.value ? 'border-primary scale-110 shadow-lg' : 'border-transparent'}`}
                                                style={{ backgroundColor: c.value }}
                                                title={c.name}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                    
                    <section>
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Voice Interface</h3>
                        <div className="space-y-4">
                             <div className="bg-card/50 p-4 rounded-lg border border-border space-y-6">
                                <div className="flex items-start gap-4">
                                     <div className="p-2 bg-muted rounded-lg">
                                         {/* Mic Icon moved to voice indicator context, purely settings here */}
                                         <Settings className="w-5 h-5 text-muted-foreground" />
                                     </div>
                                     <div className="flex-1 space-y-4">
                                         <div>
                                            <div className="flex justify-between mb-2">
                                                <span className="text-sm font-medium">Mic Sensitivity</span>
                                                <span className="text-xs text-muted-foreground">{(ui.voiceSettings?.sensitivity || 1).toFixed(1)}x</span>
                                            </div>
                                            <input 
                                                type="range" min="0.1" max="2.0" step="0.1"
                                                value={ui.voiceSettings?.sensitivity || 1}
                                                onChange={(e) => setVoiceSettings({ sensitivity: parseFloat(e.target.value) })}
                                                className="w-full accent-primary h-1 bg-muted rounded-lg appearance-none cursor-pointer"
                                            />
                                         </div>

                                         <div>
                                            <div className="flex justify-between mb-2">
                                                <span className="text-sm font-medium">Visualizer Smoothness</span>
                                                <span className="text-xs text-muted-foreground">{(ui.voiceSettings?.responsiveness || 0.5).toFixed(1)}</span>
                                            </div>
                                            <input 
                                                type="range" min="0.1" max="1.0" step="0.1"
                                                value={ui.voiceSettings?.responsiveness || 0.5}
                                                onChange={(e) => setVoiceSettings({ responsiveness: parseFloat(e.target.value) })}
                                                className="w-full accent-primary h-1 bg-muted rounded-lg appearance-none cursor-pointer"
                                            />
                                         </div>

                                         <div className="pt-2 border-t border-border">
                                             <span className="text-sm font-medium block mb-2">Color Mode</span>
                                             <div className="flex gap-2">
                                                {['primary', 'rainbow', 'monochrome'].map((mode) => (
                                                    <button
                                                        key={mode}
                                                        onClick={() => setVoiceSettings({ visualizerColor: mode as any })}
                                                        className={`px-3 py-1.5 rounded text-xs border transition-all ${ui.voiceSettings?.visualizerColor === mode ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 border-border hover:border-primary/50'}`}
                                                    >
                                                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                                                    </button>
                                                ))}
                                             </div>
                                         </div>
                                     </div>
                                </div>
                             </div>
                        </div>
                    </section>
                </div>
            </WindowFrame>

            <WindowFrame constraintsRef={constraintsRef} id="terminal" title="System Terminal" icon={Terminal} width="700px" height="450px" windowState={windows['terminal']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow} onSnap={snapWindow} activeWindowId={activeWindowId} focusMode={ui.focusMode}>
                <SystemTerminal />
            </WindowFrame>

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
