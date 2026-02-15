
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../context/StoreContext";
import { aiService } from "../../services/aiService";
import { ActionRequest, Conversation } from "../../types";
import ReactMarkdown from 'react-markdown';
import { Plus, MessageSquare, Trash2, Copy, RefreshCw, Check, ChevronLeft, ChevronRight, MoreHorizontal, Edit2, X, Mic, MicOff } from 'lucide-react';
import { ChannelExplorer } from './ChannelExplorer';

export function ChatInterface() {
    const {
        activeConversation,
        conversations,
        activeConversationId,
        addMessage,
        updateMessage,
        deleteMessage,
        setThinking,
        agent,
        startListening,
        stopListening,
        addThought,
        setPendingAction,
        addToHistory,
        openWindow,
        setSelectedAsset,
        createConversation,
        switchConversation,
        deleteConversation,
        renameConversation,
        clearConversation
    } = useStore();

    const [input, setInput] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState<string | null>(null);
    const [editTitleValue, setEditTitleValue] = useState("");
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync voice transcript
    useEffect(() => {
        if (agent.isListening && agent.transcript) {
            setInput(agent.transcript);
        }
    }, [agent.transcript, agent.isListening]);

    // Auto-scroll to bottom — use scrollTop on the container to prevent ancestor scroll
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, [activeConversation]);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Persist conversations to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('nexus_conversations', JSON.stringify(conversations));
        } catch (e) {
            console.warn("Could not persist conversations");
        }
    }, [conversations]);

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isProcessing) return;

        const text = input;
        setInput("");
        setIsProcessing(true);
        setThinking(true);

        const userMessageId = Date.now().toString();

        addMessage({
            id: userMessageId,
            role: 'user',
            content: text,
            timestamp: new Date()
        });

        addToHistory(text);

        const assistantMessageId = (Date.now() + 1).toString();
        let assistantContent = "";

        addMessage({
            id: assistantMessageId,
            role: 'assistant',
            content: "...",
            timestamp: new Date()
        });

        try {
            await aiService.sendMessage(
                text,
                (chunk) => {
                    assistantContent += chunk;
                    updateMessage(assistantMessageId, assistantContent);
                },
                (action: ActionRequest) => {
                    if (action.tool === 'open_editor') {
                        const path = action.parameters.path;
                        setSelectedAsset({
                            id: `file-${Date.now()}`,
                            name: path.split(/[/\\]/).pop() || 'file',
                            type: 'code',
                            url: path
                        });
                        openWindow('code');
                        addThought({
                            id: `action-${Date.now()}`,
                            timestamp: new Date(),
                            type: 'action',
                            component: 'supervisor',
                            content: `System: Opening editor for ${path}`
                        });
                        return;
                    }

                    setPendingAction(action);
                    addThought({
                        id: `action-${Date.now()}`,
                        timestamp: new Date(),
                        type: 'action',
                        component: 'supervisor',
                        content: `System: Authorizing ${action.tool}...`
                    });
                },
                (error: any) => {
                    const errorMsg = error.error || JSON.stringify(error);
                    const type = error.type || 'System Alert';
                    const message = `⚠️ **${type}**\n${errorMsg}\n\n*Required systems may be offline.*`;
                    updateMessage(assistantMessageId, message);
                }
            );
        } catch (err) {
            updateMessage(assistantMessageId, "Connection severed.");
        } finally {
            setIsProcessing(false);
            setThinking(false);
        }
    };

    const handleCopy = (content: string, id: string) => {
        navigator.clipboard.writeText(content);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleRegenerate = async (messageIndex: number) => {
        // Find the last user message before this assistant message
        let userMessage = null;
        for (let i = messageIndex - 1; i >= 0; i--) {
            if (activeConversation[i].role === 'user') {
                userMessage = activeConversation[i];
                break;
            }
        }
        if (userMessage) {
            setInput(userMessage.content);
            // Delete messages from this point
            const toDelete = activeConversation.slice(messageIndex);
            toDelete.forEach(m => deleteMessage(m.id));
        }
    };

    const handleNewChat = () => {
        createConversation();
    };

    const handleStartEdit = (id: string, title: string) => {
        setEditingTitle(id);
        setEditTitleValue(title);
    };

    const handleSaveTitle = () => {
        if (editingTitle && editTitleValue.trim()) {
            renameConversation(editingTitle, editTitleValue.trim());
        }
        setEditingTitle(null);
    };

    const currentConv = conversations.find(c => c.id === activeConversationId);

    return (
        <div className="flex h-full bg-transparent overflow-hidden font-outfit relative">

            {/* Conversation Sidebar */}
            <AnimatePresence>
                {sidebarOpen && (
                    <motion.div
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 260, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        className="h-full bg-muted/30 border-r border-border/50 flex flex-col overflow-hidden"
                    >
                        <div className="p-3 border-b border-border/50 flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Conversations</span>
                            <button
                                onClick={handleNewChat}
                                className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors"
                                title="New Chat"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {conversations.map(conv => (
                                <div
                                    key={conv.id}
                                    className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${conv.id === activeConversationId
                                        ? 'bg-primary/10 text-primary'
                                        : 'hover:bg-muted/50 text-muted-foreground'
                                        }`}
                                    onClick={() => switchConversation(conv.id)}
                                >
                                    <MessageSquare className="w-4 h-4 shrink-0" />
                                    {editingTitle === conv.id ? (
                                        <input
                                            value={editTitleValue}
                                            onChange={e => setEditTitleValue(e.target.value)}
                                            onBlur={handleSaveTitle}
                                            onKeyDown={e => e.key === 'Enter' && handleSaveTitle()}
                                            className="flex-1 bg-transparent border-b border-primary text-sm focus:outline-none"
                                            autoFocus
                                            onClick={e => e.stopPropagation()}
                                        />
                                    ) : (
                                        <span className="flex-1 text-sm truncate">{conv.title}</span>
                                    )}
                                    <div className="opacity-0 group-hover:opacity-100 flex gap-1 shrink-0">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleStartEdit(conv.id, conv.title); }}
                                            className="p-1 hover:bg-muted rounded"
                                        >
                                            <Edit2 className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                                            className="p-1 hover:bg-destructive/20 text-destructive rounded"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="border-t border-border/50 p-2">
                            <ChannelExplorer />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* Sidebar Toggle */}
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="absolute top-3 left-3 z-10 p-1.5 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                    {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                {/* The Echo (Message History) */}
                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-8 pb-32 space-y-8 scrollbar-hide mask-gradient-t w-full">
                    <div className="max-w-4xl mx-auto w-full flex flex-col space-y-8 pt-8">
                        <AnimatePresence initial={false}>
                            {activeConversation.map((msg, index) => {
                                const isLast = index === activeConversation.length - 1;
                                const isOld = index < activeConversation.length - 2;

                                return (
                                    <motion.div
                                        key={msg.id}
                                        initial={{ opacity: 0, y: 5, scale: 0.98, filter: 'blur(5px)' }}
                                        animate={{
                                            opacity: isOld ? 0.3 : 1,
                                            y: 0,
                                            filter: isOld ? 'blur(2px)' : 'blur(0px)',
                                            scale: isOld ? 0.98 : 1
                                        }}
                                        transition={{ duration: 0.8, ease: "easeOut" }}
                                        className={`group flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                                    >
                                        <span className={`text-[10px] tracking-[0.2em] uppercase mb-2 opacity-40 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                                            {msg.role === 'user' ? 'Architect' : 'Echoes'}
                                        </span>

                                        <div className={`relative max-w-[90%] text-lg md:text-xl font-light leading-relaxed ${msg.role === 'user'
                                            ? 'text-right text-foreground'
                                            : 'text-left text-primary/90 text-glow'
                                            }`}>
                                            {msg.role === 'user' ? (
                                                msg.content
                                            ) : (
                                                <ReactMarkdown
                                                    components={{
                                                        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                                                        strong: ({ children }) => <strong className="font-semibold text-white text-shadow-sm">{children}</strong>,
                                                        code: ({ children }) => <code className="bg-black/30 px-1 py-0.5 rounded text-sm font-mono text-accent">{children}</code>,
                                                        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                                                        li: ({ children }) => <li className="opacity-90">{children}</li>,
                                                    }}
                                                >
                                                    {msg.content}
                                                </ReactMarkdown>
                                            )}
                                        </div>

                                        {/* Message Actions */}
                                        {msg.role === 'assistant' && msg.content !== '...' && (
                                            <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleCopy(msg.content, msg.id)}
                                                    className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                                                    title="Copy"
                                                >
                                                    {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                                </button>
                                                <button
                                                    onClick={() => handleRegenerate(index)}
                                                    className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                                                    title="Regenerate"
                                                >
                                                    <RefreshCw className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                        <div />
                    </div>
                </div>

                {/* Input Area */}
                <motion.div
                    className="absolute left-0 right-0 bottom-0 h-32 flex justify-center items-end pb-10 z-20 bg-gradient-to-t from-background via-background/80 to-transparent"
                >
                    <form onSubmit={handleSubmit} className="w-full max-w-2xl relative flex flex-col items-center transition-all duration-700">
                        <div className="relative w-full flex justify-center">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={handleInput}
                                placeholder={isProcessing ? "Echoes Processing..." : "Echoes awaiting command..."}
                                disabled={isProcessing}
                                className="w-full bg-transparent text-center text-2xl font-light text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0 border-none tracking-wide"
                                autoComplete="off"
                            />

                            <motion.div
                                className="absolute -bottom-2 h-[1px] bg-primary/50"
                                initial={{ width: "20px" }}
                                animate={{
                                    width: input.length > 0 ? "100%" : "20px",
                                    opacity: isProcessing ? 0.5 : 1
                                }}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            />

                            <AnimatePresence>
                                {!input && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="absolute -bottom-[22px] w-1 h-1 bg-primary rounded-full animate-pulse-slow shadow-[0_0_10px_var(--primary)]"
                                    />
                                )}
                            </AnimatePresence>

                            {/* Voice Input Button */}
                            <motion.button
                                type="button"
                                onClick={agent.isListening ? stopListening : startListening}
                                className={`absolute right-0 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all ${agent.isListening ? 'bg-red-500/20 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                title={agent.isListening ? "Stop Listening" : "Start Voice Input"}
                            >
                                {agent.isListening ? <MicOff className="w-5 h-5 animate-pulse" /> : <Mic className="w-5 h-5" />}
                            </motion.button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </div>
    );
}
