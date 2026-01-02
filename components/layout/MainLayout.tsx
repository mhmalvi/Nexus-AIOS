
import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { StatusBar } from "./StatusBar";
import { ThoughtStream } from "../agent/ThoughtStream";
import { CommandInput } from "../command/CommandInput";
import { CommandPalette } from "../command/CommandPalette";
import { GhostCommandBar } from "../command/GhostCommandBar";
import { MemoryViewer } from "../agent/MemoryViewer";
import { WarRoom } from "../agent/WarRoom";
import { NotificationCenter } from "./NotificationCenter";
import { SummaryOverlay } from "./SummaryOverlay";
import { useStore } from "../../context/StoreContext";
import { User, Bot, Terminal, Code, Globe, Search, Maximize2, X, Minus, Layout, ChevronRight, ChevronLeft, Boxes, Settings, Users, Keyboard } from "lucide-react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";

const WindowFrame = ({ id, title, icon: Icon, children, width, height, windowState, onClose, onMinimize, onMaximize, onFocus }: any) => {
    const dragControls = useDragControls();
    if (!windowState || !windowState.isOpen) return null;

    return (
        <motion.div
            key={id}
            drag={!windowState.isMaximized}
            dragListener={false}
            dragControls={dragControls}
            dragMomentum={false}
            dragElastic={0.1}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ 
                opacity: windowState.isMinimized ? 0 : 1, 
                scale: windowState.isMinimized ? 0.8 : 1, 
                y: windowState.isMinimized ? 200 : 0,
                x: windowState.isMinimized ? 0 : undefined,
                pointerEvents: windowState.isMinimized ? 'none' : 'auto'
            }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={`absolute glass-panel rounded-lg overflow-hidden shadow-2xl border border-border flex flex-col transition-all duration-300
                ${windowState.isMaximized ? '!inset-2 !w-auto !h-auto z-50' : ''}
            `}
            style={{ 
                zIndex: windowState.zIndex, 
                left: windowState.isMaximized ? 0 : (id === 'chat' ? '120px' : '25%'), 
                top: windowState.isMaximized ? 0 : (id === 'chat' ? '100px' : '15%'),
                width: windowState.isMaximized ? 'auto' : width,
                height: windowState.isMaximized ? 'auto' : height,
            }}
            onMouseDown={() => onFocus(id)}
        >
            <div 
                className="h-10 bg-muted/80 backdrop-blur-md border-b border-border flex items-center justify-between px-4 cursor-default select-none"
                onPointerDown={(e) => {
                    if (!windowState.isMaximized) dragControls.start(e);
                    onFocus(id);
                }}
                onDoubleClick={() => onMaximize(id)}
            >
                <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-foreground tracking-wide uppercase">{title}</span>
                </div>
                <div className="flex gap-2 items-center" onPointerDown={(e) => e.stopPropagation()}>
                    <button onClick={() => onMinimize(id)} className="w-6 h-6 flex items-center justify-center hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"><Minus className="w-3.5 h-3.5" /></button>
                    <button onClick={() => onMaximize(id)} className="w-6 h-6 flex items-center justify-center hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"><Maximize2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => onClose(id)} className="w-6 h-6 flex items-center justify-center hover:bg-red-500/20 rounded text-muted-foreground hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5" /></button>
                </div>
            </div>
            <div className="flex-1 overflow-hidden relative bg-card/50 backdrop-blur-sm">
                {children}
            </div>
        </motion.div>
    );
};

export function MainLayout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  
  const { 
      activeConversation, artifacts, closeArtifact, windows, closeWindow, minimizeWindow, maximizeWindow, focusWindow, 
      ui, setAccentColor, activeWindowId, setCommandPaletteOpen, openWindow
  } = useStore();
  
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        // Toggle Sidebar: Cmd+B
        if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
            e.preventDefault();
            setIsRightSidebarOpen(prev => !prev);
        }
        // Shortcuts Help: Cmd+/
        if ((e.metaKey || e.ctrlKey) && e.key === '/') {
            e.preventDefault();
            openWindow('settings'); // Quick hack to show settings where cheat sheet is
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    <div className="h-screen w-screen relative bg-background overflow-hidden font-sans text-foreground selection:bg-primary/20 transition-colors duration-300">
      
      {/* 0. DESKTOP WALLPAPER */}
      <div className="absolute inset-0 z-0 pointer-events-none">
         <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
         <div className="absolute bottom-0 left-0 w-full h-1/2 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-secondary/30 via-background to-background" />
         <div className="absolute inset-0 bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] bg-[size:100px_100px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_100%)] opacity-[0.03]" />
      </div>

      <CommandPalette />
      <GhostCommandBar />
      <NotificationCenter isOpen={isNotificationsOpen} onClose={() => setIsNotificationsOpen(false)} />
      <SummaryOverlay isOpen={isSummaryOpen} onClose={() => setIsSummaryOpen(false)} activeWindowId={activeWindowId} />
      
      {/* 1. HEADER */}
      <div className="absolute top-0 left-0 right-0 z-[60] h-10">
        <Header 
            onToggleNotifications={() => setIsNotificationsOpen(!isNotificationsOpen)} 
            onSummarize={() => setIsSummaryOpen(true)}
        />
      </div>

      {/* 2. SIDEBAR */}
      <div className="absolute top-12 bottom-20 left-3 z-[55] flex flex-col justify-center pointer-events-none">
        <div className="pointer-events-auto">
            <Sidebar 
                isCollapsed={isSidebarCollapsed}
                onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            />
        </div>
      </div>

      {/* 3. MAIN DESKTOP */}
      <main className="absolute inset-0 pt-10 pb-16 px-0 z-10 overflow-hidden pointer-events-none">
        <div className="relative w-full h-full pointer-events-auto">

            {/* Communicator */}
            <WindowFrame id="chat" title="Nexus Communicator" icon={Bot} width="450px" height="80%" windowState={windows['chat']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow}>
                 <div className="flex flex-col h-full bg-background/40">
                    <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-4 scrollbar-hide">
                        {activeConversation.map((msg) => (
                            <motion.div 
                                key={msg.id} 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`flex gap-3 group ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-1 border border-border ${
                                    msg.role === 'user' ? 'bg-secondary text-secondary-foreground' : 'bg-primary text-primary-foreground'
                                }`}>
                                    {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                                </div>
                                <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm border ${
                                        msg.role === 'user' 
                                        ? 'bg-secondary border-border text-foreground rounded-tr-sm' 
                                        : 'bg-card border-border text-card-foreground rounded-tl-sm'
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
                    <div className="p-4 bg-background/60 backdrop-blur-md border-t border-border">
                        <CommandInput />
                    </div>
                 </div>
            </WindowFrame>

            <WindowFrame id="war-room" title="War Room / Mission Control" icon={Layout} width="900px" height="650px" windowState={windows['war-room']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow}>
                <WarRoom />
            </WindowFrame>

            <WindowFrame id="memory" title="Memory Core Visualization" icon={Boxes} width="900px" height="650px" windowState={windows['memory']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow}>
                <MemoryViewer />
            </WindowFrame>

             <WindowFrame id="agents" title="Autonomous Swarm" icon={Users} width="700px" height="500px" windowState={windows['agents']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow}>
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-background/50">
                    <div className="grid grid-cols-2 gap-6 p-8 w-full h-full overflow-y-auto">
                        {['Scheduler', 'Researcher', 'Coder', 'Reviewer'].map((role, i) => (
                            <div key={i} className="glass-panel p-4 rounded-xl border border-border hover:border-primary/50 transition-colors cursor-pointer group">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Bot className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <div className="font-bold text-foreground">Agent-{role}</div>
                                        <div className="text-xs text-green-500 flex items-center gap-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                            Active
                                        </div>
                                    </div>
                                </div>
                                <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded h-20 overflow-hidden font-mono">
                                    > Waiting for task assignment...
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </WindowFrame>
            
            {/* UPDATED SETTINGS WINDOW */}
             <WindowFrame id="settings" title="System Settings" icon={Settings} width="600px" height="650px" windowState={windows['settings']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow}>
                <div className="p-6 space-y-8 bg-background/50 h-full overflow-y-auto">
                    {/* Appearance Section */}
                    <section>
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Appearance</h3>
                        <div className="space-y-4">
                            <div className="glass-panel p-4 rounded-xl border border-border space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">Interface Theme</span>
                                    <div className="flex gap-2">
                                        <button className="w-8 h-8 rounded-full bg-white border border-gray-200 shadow-sm hover:scale-110 transition-transform" onClick={() => {/* Theme toggle handled in palette */}} title="Light" />
                                        <button className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-700 shadow-sm hover:scale-110 transition-transform" onClick={() => {/* Theme toggle handled in palette */}} title="Dark" />
                                    </div>
                                </div>
                                <div className="pt-4 border-t border-border">
                                    <span className="text-sm font-medium mb-3 block">Accent Color</span>
                                    <div className="flex gap-3">
                                        {colors.map((c) => (
                                            <button
                                                key={c.value}
                                                onClick={() => setAccentColor(c.value)}
                                                className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${ui.accentColor === c.value ? 'border-foreground scale-110' : 'border-transparent'}`}
                                                style={{ backgroundColor: c.value }}
                                                title={c.name}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                    
                    {/* Shortcuts Cheat Sheet */}
                    <section>
                         <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Keyboard Shortcuts</h3>
                         <div className="glass-panel p-0 rounded-xl border border-border overflow-hidden">
                             {[
                                 { keys: ['⌘', 'K'], label: 'Toggle Command Palette' },
                                 { keys: ['⌘', 'J'], label: 'Toggle Ghost Bar' },
                                 { keys: ['⌘', 'B'], label: 'Toggle Right Sidebar' },
                                 { keys: ['Alt', 'Space'], label: 'Quick Search' },
                             ].map((s, i) => (
                                 <div key={i} className="flex items-center justify-between p-3 border-b border-border last:border-0 hover:bg-muted/30">
                                     <span className="text-sm text-foreground">{s.label}</span>
                                     <div className="flex gap-1">
                                         {s.keys.map(k => (
                                             <kbd key={k} className="bg-muted px-2 py-1 rounded text-xs font-mono border border-border">{k}</kbd>
                                         ))}
                                     </div>
                                 </div>
                             ))}
                         </div>
                    </section>

                    <section>
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Kernel</h3>
                        <div className="flex items-center justify-between p-3 glass-panel rounded-lg border border-border">
                            <span>Version</span>
                            <span className="font-mono text-xs">v3.0.1-stable</span>
                        </div>
                    </section>
                </div>
            </WindowFrame>

            <AnimatePresence>
                {artifacts.map((artifact, i) => (
                    <motion.div 
                        key={artifact.id}
                        drag
                        dragMomentum={false}
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="absolute rounded-xl overflow-hidden glass-panel shadow-2xl ring-1 ring-border z-[60]"
                        style={{
                            top: `${10 + (i * 3)}%`,
                            left: `${40 + (i * 3)}%`,
                            width: '500px',
                            height: '400px',
                        }}
                    >
                        <div className="h-9 bg-muted/50 border-b border-border flex items-center justify-between px-3 cursor-move">
                            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                                <div className="flex gap-1.5 mr-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 hover:bg-red-500 border border-red-500/30 cursor-pointer" onClick={() => closeArtifact(artifact.id)} />
                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/30" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/30" />
                                </div>
                                <span className="opacity-90 tracking-wide text-[10px] uppercase font-bold">{artifact.title}</span>
                            </div>
                        </div>
                        <div className="h-full bg-card p-4 overflow-auto pb-10">
                            {artifact.type === 'code' ? (
                                <pre className="text-xs font-mono text-foreground/80 leading-relaxed p-2 bg-muted/30 rounded border border-border">
                                    {artifact.content}
                                </pre>
                            ) : (
                                <div className="text-sm text-foreground">{artifact.content}</div>
                            )}
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
      </main>

      {/* 4. RIGHT SIDEBAR */}
      <div className={`fixed right-0 top-12 bottom-16 transition-all duration-500 ease-spring pointer-events-auto z-[55] ${isRightSidebarOpen ? 'w-80 translate-x-0' : 'w-0 translate-x-full'}`}>
           <div className="h-full flex flex-col glass-panel border-l border-y border-border shadow-2xl my-2 ml-2 rounded-l-xl">
              <div className="h-9 bg-muted/40 border-b border-border flex items-center justify-between px-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Kernel Stream</span>
                  <button onClick={() => setIsRightSidebarOpen(false)} className="hover:text-foreground text-muted-foreground">
                      <ChevronRight className="w-4 h-4" />
                  </button>
              </div>
              <ThoughtStream />
           </div>
      </div>

      {!isRightSidebarOpen && (
          <button onClick={() => setIsRightSidebarOpen(true)} className="fixed right-0 top-1/2 -translate-y-1/2 z-[55] p-1.5 bg-background/80 border-l border-t border-b border-border rounded-l-lg backdrop-blur-md shadow-lg hover:pr-3 transition-all">
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
      )}
      
      {/* 5. SLIM BOTTOM DOCK */}
      <StatusBar />
    </div>
  );
}
