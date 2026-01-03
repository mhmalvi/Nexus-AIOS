
import React, { useState, useEffect, useRef } from "react";
import { Header } from "./Header";
import { StatusBar } from "./StatusBar";
import { Dock } from "./Dock";
import { ThoughtStream } from "../agent/ThoughtStream";
import { CommandInput } from "../command/CommandInput";
import { CommandPalette } from "../command/CommandPalette";
import { GhostCommandBar } from "../command/GhostCommandBar";
import { MemoryViewer } from "../agent/MemoryViewer";
import { WarRoom } from "../agent/WarRoom";
import { SwarmCluster } from "../agent/SwarmCluster";
import { NotificationCenter } from "./NotificationCenter";
import { SummaryOverlay } from "./SummaryOverlay";
import { useStore } from "../../context/StoreContext";
import { User, Bot, Terminal, Code, Globe, Search, Maximize2, Minimize2, X, Minus, Layout, ChevronRight, ChevronLeft, Layers, Settings, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const WindowFrame = ({ id, title, icon: Icon, children, width, height, windowState, onClose, onMinimize, onMaximize, onFocus, onSnap, activeWindowId, focusMode, constraintsRef }: any) => {
    if (!windowState || !windowState.isOpen) return null;
    if (focusMode && activeWindowId !== id) return null;

    // Adjusted TOP_OFFSET for 36px header + buffer
    const TOP_OFFSET = 42;
    
    const initialX = id === 'chat' ? 80 : 250;
    const initialY = id === 'chat' ? 80 : 100;

    let targetAnim: any = {
        opacity: windowState.isMinimized ? 0 : 1,
        scale: windowState.isMinimized ? 0.8 : 1,
        filter: windowState.isMinimized ? "blur(20px)" : "blur(0px)",
    };

    if (focusMode) {
         targetAnim = { ...targetAnim, top: '50%', left: '50%', x: '-50%', y: '-50%', width: width, height: height, position: 'fixed', zIndex: 100 };
    } else if (windowState.isMaximized) {
        // Full screen (minus header), flush to edges and bottom
        targetAnim = { ...targetAnim, top: TOP_OFFSET, left: 0, right: 0, bottom: 0, width: 'auto', height: 'auto', borderRadius: 0 };
    } else if (windowState.snap === 'left') {
        targetAnim = { ...targetAnim, top: TOP_OFFSET, left: 0, bottom: 0, width: '50%', height: 'auto', borderRadius: 0 };
    } else if (windowState.snap === 'right') {
        targetAnim = { ...targetAnim, top: TOP_OFFSET, right: 0, bottom: 0, width: '50%', height: 'auto', left: 'auto', borderRadius: 0 };
    }

    const handleDragEnd = (event: any, info: any) => {
        if (focusMode) return;
        const x = info.point.x;
        const y = info.point.y;
        const screenW = window.innerWidth;
        if (x < 30) onSnap(id, 'left');
        else if (x > screenW - 30) onSnap(id, 'right');
        else if (y < 60) onMaximize(id); 
        else if (windowState.snap || windowState.isMaximized) onSnap(id, null);
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
                layout: { type: "spring", stiffness: 350, damping: 30 },
                opacity: { duration: 0.2 }
            }}
            className={`absolute flex flex-col glass-panel shadow-2xl overflow-hidden
                ${(windowState.snap || windowState.isMaximized || focusMode) ? '' : 'rounded-xl'}
                ${activeWindowId === id ? 'ring-1 ring-primary/40 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.3)]' : 'grayscale-[0.3] opacity-90'}
                ${focusMode ? 'shadow-[0_0_100px_rgba(0,0,0,0.5)] border-white/20' : ''}
            `}
            style={{ 
                zIndex: windowState.zIndex,
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
                    onDoubleClick={() => onMaximize(id)}
                >
                    <div className="flex items-center gap-3 text-xs font-bold tracking-wide text-foreground/80">
                        <Icon className="w-3.5 h-3.5 opacity-70" />
                        <span>{title}</span>
                    </div>
                    
                    <div className="flex items-center gap-2 z-50" onPointerDown={(e) => e.stopPropagation()}>
                        <button onClick={() => onMinimize(id)} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"><Minus className="w-3 h-3" /></button>
                        <button onClick={() => onMaximize(id)} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                            {windowState.isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                        </button>
                        <button onClick={() => onClose(id)} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-destructive hover:text-destructive-foreground transition-colors text-muted-foreground"><X className="w-3 h-3" /></button>
                    </div>
                </div>
            )}
            <div className="flex-1 overflow-hidden relative bg-background/40 backdrop-blur-sm" onPointerDown={(e) => e.stopPropagation()}>
                {children}
            </div>
        </motion.div>
    );
};

export function MainLayout() {
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  
  const { 
      activeConversation, artifacts, closeArtifact, windows, closeWindow, minimizeWindow, maximizeWindow, focusWindow, 
      ui, setAccentColor, activeWindowId, setCommandPaletteOpen, openWindow, snapWindow
  } = useStore();
  
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const constraintsRef = React.useRef(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
            e.preventDefault();
            setIsRightSidebarOpen(prev => !prev);
        }
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
         {ui.focusMode && <div className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-all duration-700" />}
      </div>

      <CommandPalette />
      <GhostCommandBar />
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
                {artifacts.map((artifact, i) => (
                    <motion.div 
                        key={artifact.id}
                        drag={!ui.focusMode}
                        dragConstraints={constraintsRef}
                        dragMomentum={false}
                        whileDrag={{ scale: 1.05, cursor: 'grabbing', zIndex: 100 }}
                        initial={{ opacity: 0, scale: 0.8, y: 50, rotateX: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20 }}
                        className={`absolute rounded-2xl overflow-hidden glass-panel shadow-2xl z-[60]
                            ${ui.focusMode ? 'grayscale opacity-20 hover:grayscale-0 hover:opacity-100 transition-all' : ''}
                        `}
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
                </div>
            </WindowFrame>

        </div>
      </main>

      {/* Right Sidebar (Thought Stream) - Hidden in Focus Mode */}
      <div className={`fixed right-0 top-[36px] bottom-0 transition-all duration-500 z-[40] ${isRightSidebarOpen && !ui.focusMode ? 'w-80 translate-x-0 opacity-100' : 'w-0 translate-x-full opacity-0 pointer-events-none'}`}>
           <div className="h-full flex flex-col glass-panel border-r-0 border-y-0 border-l border-border/50 backdrop-blur-xl">
              <ThoughtStream />
           </div>
      </div>

      {!isRightSidebarOpen && !ui.focusMode && (
          <button onClick={() => setIsRightSidebarOpen(true)} className="fixed right-0 top-1/2 -translate-y-1/2 z-[40] p-1.5 bg-card border border-border rounded-l-lg hover:pr-3 transition-all shadow-lg">
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
      )}
      
      <Dock />
      <StatusBar />
    </div>
  );
}
