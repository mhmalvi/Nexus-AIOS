
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Copy, Wand2, RefreshCcw } from "lucide-react";
import { useStore } from "../../context/StoreContext";
import { aiService } from "../../services/aiService";

interface SummaryOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    activeWindowId: string | null;
}

export function SummaryOverlay({ isOpen, onClose, activeWindowId }: SummaryOverlayProps) {
    const { activeConversation, thoughtStream } = useStore();
    const [summary, setSummary] = useState("Initializing analyzer...");
    const [loading, setLoading] = useState(false);

    const generateSummary = async () => {
        setLoading(true);
        const text = await aiService.summarize({
            history: activeConversation.slice(-5),
            thoughts: thoughtStream.slice(0, 10),
            window: activeWindowId
        });
        setSummary(text);
        setLoading(false);
    };

    useEffect(() => {
        if (isOpen) generateSummary();
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/40 backdrop-blur-md"
            />
            
            <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 10 }}
                className="relative bg-background/90 backdrop-blur-3xl border border-primary/20 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden ring-1 ring-primary/30"
            >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-nexus-memory to-primary animate-pulse" />
                
                <div className="p-6">
                    <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                <Sparkles className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-foreground">Kernel Summary</h3>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Target: {activeWindowId || 'SYSTEM'}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-1 hover:bg-muted rounded text-muted-foreground transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="p-4 bg-muted/20 rounded-xl border border-border/50 text-sm leading-relaxed text-foreground/90 font-mono min-h-[120px]">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-full gap-2 opacity-50">
                                    <RefreshCcw className="w-4 h-4 animate-spin" />
                                    <span className="text-[10px] uppercase tracking-widest">Analyzing Memory Segments...</span>
                                </div>
                            ) : (
                                <p>{summary}</p>
                            )}
                        </div>
                        
                        <div className="flex justify-end gap-3 pt-2">
                             <button 
                                onClick={generateSummary}
                                className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                             >
                                 <RefreshCcw className="w-3.5 h-3.5" /> Re-Analyze
                             </button>
                             <button onClick={onClose} className="px-6 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95">
                                 Acknowledge
                             </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
    