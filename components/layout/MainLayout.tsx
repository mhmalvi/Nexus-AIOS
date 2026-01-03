
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
import { ModuleManager } from "../tools/ModuleManager";
import { ImageViewer } from "../tools/ImageViewer";
import { LockScreen } from "../system/LockScreen";
import { NotificationCenter } from "./NotificationCenter";
import { SummaryOverlay } from "./SummaryOverlay";
import { ContextMenu } from "../ui/ContextMenu";
import { WindowFrame } from "../system/WindowFrame"; 
import { useStore } from "../../context/StoreContext";
import { User, Bot, Terminal, Code, Globe, Search, Layout, Layers, Settings, Users, Folder, FileCode, Calendar, Package, Image as ImageIcon, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function MainLayout() {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{x: number, y: number} | null>(null);
  
  const { 
      activeConversation, artifacts, closeArtifact, windows, closeWindow, minimizeWindow, maximizeWindow, focusWindow, 
      ui, activeWindowId, setCommandPaletteOpen, openWindow, snapWindow, resizeWindow, moveWindow, toggleAlwaysOnTop
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

  const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      if (e.target === e.currentTarget || (e.target as HTMLElement).id === "desktop-area") {
          setContextMenu({ x: e.clientX, y: e.clientY });
      }
  };

  const getToolIcon = (tool?: string) => {
    switch(tool) {
        case 'terminal': return <Terminal className="w-3 h-3" />;
        case 'browser': return <Globe className="w-3 h-3" />;
        case 'search': return <Search className="w-3 h-3" />;
        case 'code': return <Code className="w-3 h-3" />;
        default: return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-background overflow-hidden font-sans text-foreground selection:bg-primary/20 transition-colors duration-500"
         onContextMenu={handleContextMenu}
         onClick={() => setContextMenu(null)}
    >
      
      {/* Dynamic Background */}
      <div id="desktop-area" className="absolute inset-0 z-0 pointer-events-auto">
         <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[120px] rounded-full dark:opacity-30 pointer-events-none" />
         <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[100px] rounded-full dark:opacity-20 pointer-events-none" />
         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] pointer-events-none" />
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

      {/* Main Desktop Area */}
      <main className="absolute top-0 bottom-0 left-0 right-0 z-10 pointer-events-none" ref={constraintsRef}>
        
        <div className="relative w-full h-full pointer-events-auto">
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

            <WindowFrame constraintsRef={constraintsRef} id="modules" title="Neural Modules" icon={Package} width={800} height={600} windowState={windows['modules']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow} onSnap={snapWindow} onResize={resizeWindow} onMove={moveWindow} onToggleAlwaysOnTop={toggleAlwaysOnTop} activeWindowId={activeWindowId} focusMode={ui.focusMode}>
                <ModuleManager />
            </WindowFrame>

            <WindowFrame constraintsRef={constraintsRef} id="media" title="Holo-Viewer" icon={ImageIcon} width={900} height={700} windowState={windows['media']} onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} onFocus={focusWindow} onSnap={snapWindow} onResize={resizeWindow} onMove={moveWindow} onToggleAlwaysOnTop={toggleAlwaysOnTop} activeWindowId={activeWindowId} focusMode={ui.focusMode}>
                <ImageViewer />
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
