
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Copy, Wand2 } from "lucide-react";

interface SummaryOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    activeWindowId: string | null;
}

export function SummaryOverlay({ isOpen, onClose, activeWindowId }: SummaryOverlayProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            
            <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 10 }}
                className="relative bg-background/90 backdrop-blur-xl border border-primary/20 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden ring-1 ring-primary/30"
            >
                {/* Decorative Header */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
                
                <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                <Wand2 className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg">AI Summary</h3>
                                <p className="text-xs text-muted-foreground">Context: {activeWindowId?.toUpperCase() || 'SYSTEM'}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="space-y-4">
                        {/* Simulated AI Content */}
                        <div className="p-4 bg-muted/30 rounded-xl border border-border text-sm leading-relaxed text-foreground/90 font-light">
                            <p className="mb-2">
                                <span className="font-semibold text-primary">Analysis Complete.</span> Based on the current context in the {activeWindowId} window, here are the key takeaways:
                            </p>
                            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                                <li>User engagement has increased by 15% in the last session.</li>
                                <li>Current memory tier usage is optimized for performance.</li>
                                <li>Pending actions require supervisor approval before execution.</li>
                            </ul>
                        </div>
                        
                        <div className="flex justify-end gap-2">
                             <button className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors">
                                 <Copy className="w-3.5 h-3.5" /> Copy
                             </button>
                             <button onClick={onClose} className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-md shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors">
                                 Done
                             </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
