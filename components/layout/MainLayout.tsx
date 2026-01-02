
import React, { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { StatusBar } from "./StatusBar";
import { ThoughtStream } from "../agent/ThoughtStream";
import { CommandInput } from "../command/CommandInput";
import { CommandPalette } from "../command/CommandPalette";
import { MemoryViewer } from "../agent/MemoryViewer";
import { WarRoom } from "../agent/WarRoom";
import { useStore } from "../../context/StoreContext";
import { User, Bot, Terminal, Code, Globe, Search, Maximize2, X, Copy, Minus, Layers, Layout, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "../ui/Button";

export function MainLayout() {
  const [activeView, setActiveView] = useState('chat');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const { activeConversation, toggleReaction, artifacts, closeArtifact } = useStore();
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (activeView === 'chat') {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeConversation, activeView]);

  const getToolIcon = (tool?: string) => {
    switch(tool) {
        case 'terminal': return <Terminal className="w-3 h-3" />;
        case 'browser': return <Globe className="w-3 h-3" />;
        case 'search': return <Search className="w-3 h-3" />;
        case 'code': return <Code className="w-3 h-3" />;
        default: return null;
    }
  };

  const handleReaction = (msgId: string, emoji: string) => {
    toggleReaction(msgId, emoji);
  };

  return (
    <div className="h-screen w-screen relative bg-black overflow-hidden font-sans text-foreground selection:bg-primary/20">
      {/* 0. GLOBAL DESKTOP BACKGROUND */}
      <div className="absolute inset-0 z-0">
         {/* Animated Aurora Gradient */}
         <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-background to-background opacity-80" />
         <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-blue-600/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
         <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[100px] mix-blend-screen pointer-events-none" />
         
         {/* Grid overlay */}
         <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)] pointer-events-none" />
      </div>

      <CommandPalette />
      
      {/* 1. TOP BAR (Floating) */}
      <div className="absolute top-0 left-0 right-0 z-50">
        <Header />
      </div>

      {/* 2. LEFT DOCK (Floating) */}
      <div className="absolute top-16 bottom-12 left-4 z-40 flex flex-col justify-center">
        <Sidebar 
          activeView={activeView}
          onViewChange={setActiveView}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />
      </div>

      {/* 3. RIGHT PANEL TOGGLE (If Closed) */}
      {!isRightSidebarOpen && (
          <button 
            onClick={() => setIsRightSidebarOpen(true)}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-40 p-1 bg-white/5 hover:bg-white/10 border-l border-t border-b border-white/10 rounded-l-lg backdrop-blur-md transition-all hover:pr-2"
          >
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
      )}

      {/* 4. MAIN DESKTOP AREA */}
      <main className="absolute inset-0 z-10 pt-14 pb-10 pl-20 pr-4 flex items-stretch gap-6 overflow-hidden">
        
        {/* VIEW: WAR ROOM (Full Screen App) */}
        {activeView === 'war-room' && (
            <div className="flex-1 animate-in fade-in zoom-in-95 duration-500 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                <div className="h-8 bg-white/5 border-b border-white/5 flex items-center px-4 gap-2">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                        <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
                    </div>
                    <span className="text-xs text-muted-foreground ml-2 font-mono">Mission Control</span>
                </div>
                <WarRoom />
            </div>
        )}

        {/* VIEW: MEMORY (Full Screen App) */}
        {activeView === 'memory' && (
            <div className="flex-1 animate-in fade-in zoom-in-95 duration-500 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
               <MemoryViewer />
            </div>
        )}

        {/* VIEW: DESKTOP / CHAT MODE */}
        {activeView === 'chat' && (
            <>
                {/* WINDOW 1: COMMUNICATOR (The "Chat") */}
                <div className="w-[480px] flex flex-col relative z-20 transition-all duration-500 ease-out">
                    <div className="flex-1 flex flex-col bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/5">
                        
                        {/* Window Controls */}
                        <div className="h-10 shrink-0 bg-white/5 border-b border-white/5 flex items-center justify-between px-4 backdrop-blur-md">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-zinc-300 tracking-wide flex items-center gap-2">
                                    <Bot className="w-3.5 h-3.5" /> 
                                    Nexus Communicator
                                </span>
                            </div>
                            <div className="flex gap-2 opacity-50 hover:opacity-100 transition-opacity">
                                <Minus className="w-3.5 h-3.5 cursor-pointer hover:text-white" />
                                <Maximize2 className="w-3.5 h-3.5 cursor-pointer hover:text-white" />
                                <X className="w-3.5 h-3.5 cursor-pointer hover:text-red-400" />
                            </div>
                        </div>

                        {/* Chat Scroll Area */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-4 scrollbar-hide">
                            {activeConversation.map((msg) => (
                                <div key={msg.id} className={`flex gap-3 group ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-lg mt-1 border border-white/5 ${
                                        msg.role === 'user' ? 'bg-zinc-800' : 'bg-gradient-to-tr from-indigo-600 to-purple-700'
                                    }`}>
                                        {msg.role === 'user' ? <User className="w-4 h-4 text-zinc-400" /> : <Bot className="w-4 h-4 text-white" />}
                                    </div>
                                    
                                    <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm backdrop-blur-md border ${
                                            msg.role === 'user' 
                                            ? 'bg-zinc-800/80 border-zinc-700/50 text-zinc-100 rounded-tr-sm' 
                                            : 'bg-white/5 border-white/10 text-foreground rounded-tl-sm'
                                        }`}>
                                            <div className="whitespace-pre-wrap">{msg.content}</div>
                                            {msg.role === 'assistant' && msg.tool && (
                                                <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-2 text-[10px] text-zinc-500">
                                                    {getToolIcon(msg.tool)}
                                                    <span className="uppercase tracking-wider">{msg.tool} output</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-gradient-to-t from-black/40 to-transparent">
                            <CommandInput />
                        </div>
                    </div>
                </div>

                {/* WINDOW 2: THE WORKSPACE (Artifacts) */}
                <div className="flex-1 relative z-10">
                    {artifacts.length === 0 ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/10 pointer-events-none select-none">
                            <Layout className="w-32 h-32 mb-6 stroke-[0.5]" />
                            <h1 className="text-4xl font-extralight tracking-[0.2em] uppercase">Desktop</h1>
                            <p className="mt-2 text-sm font-light tracking-widest opacity-50">System Ready . Waiting for Tasks</p>
                        </div>
                    ) : (
                        artifacts.map((artifact, i) => (
                            <div 
                                key={artifact.id}
                                className="absolute bg-zinc-900/80 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 slide-in-from-bottom-10 ring-1 ring-white/5"
                                style={{
                                    top: `${5 + (i * 3)}%`,
                                    left: `${5 + (i * 3)}%`,
                                    width: '65%',
                                    height: '60%',
                                    zIndex: 10 + i
                                }}
                            >
                                {/* Window Header */}
                                <div className="h-9 bg-white/5 border-b border-white/5 flex items-center justify-between px-3 cursor-move">
                                    <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                                        <div className="flex gap-1.5 mr-2">
                                            <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 hover:bg-red-500 transition-colors border border-red-500/30" onClick={() => closeArtifact(artifact.id)} />
                                            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 hover:bg-yellow-500 transition-colors border border-yellow-500/30" />
                                            <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 hover:bg-green-500 transition-colors border border-green-500/30" />
                                        </div>
                                        {artifact.type === 'code' ? <Code className="w-3 h-3 text-blue-400" /> : <Terminal className="w-3 h-3 text-green-400" />}
                                        <span className="opacity-80">{artifact.title}</span>
                                    </div>
                                </div>
                                {/* Content */}
                                <div className="h-full bg-black/40 overflow-auto pb-10">
                                    {artifact.type === 'code' ? (
                                        <pre className="p-6 text-xs font-mono text-blue-100 leading-relaxed">
                                            {artifact.content}
                                        </pre>
                                    ) : (
                                        <div className="p-6 text-sm text-zinc-300">{artifact.content}</div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </>
        )}

        {/* RIGHT SIDEBAR: THOUGHT STREAM (Floating Drawer) */}
        <div className={`relative transition-all duration-500 ease-spring ${isRightSidebarOpen ? 'w-80 opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-10 overflow-hidden'}`}>
             <div className="h-full flex flex-col bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/5">
                <div className="h-10 bg-white/5 border-b border-white/5 flex items-center justify-between px-3">
                    <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Kernel Activity</span>
                    <button onClick={() => setIsRightSidebarOpen(false)} className="hover:text-white text-zinc-500">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
                <ThoughtStream />
             </div>
        </div>

      </main>
      
      {/* 5. BOTTOM STATUS BAR */}
      <div className="absolute bottom-0 left-0 right-0 z-50">
          <StatusBar />
      </div>
    </div>
  );
}
