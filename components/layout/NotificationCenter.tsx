
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, Info, AlertTriangle, CheckCircle, AlertOctagon, Trash2 } from "lucide-react";
import { useStore } from "../../context/StoreContext";

interface NotificationCenterProps {
    isOpen: boolean;
    onClose: () => void;
}

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
    const { notifications, markNotificationRead, clearNotifications } = useStore();

    const getIcon = (type: string) => {
        switch(type) {
            case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
            case 'warning': return <AlertTriangle className="w-4 h-4 text-orange-500" />;
            case 'error': return <AlertOctagon className="w-4 h-4 text-red-500" />;
            default: return <Info className="w-4 h-4 text-blue-500" />;
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-sm"
                    />
                    
                    {/* Panel */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="fixed top-0 right-0 bottom-0 w-80 bg-background/95 backdrop-blur-2xl border-l border-border z-[70] shadow-2xl flex flex-col pt-12"
                    >
                        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
                            <div className="flex items-center gap-2">
                                <Bell className="w-4 h-4 text-foreground" />
                                <h2 className="font-bold text-sm">Notifications</h2>
                                <span className="bg-primary/20 text-primary text-[10px] px-1.5 rounded-full font-mono">
                                    {notifications.length}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {notifications.length > 0 && (
                                    <button onClick={clearNotifications} title="Clear All" className="hover:bg-red-500/10 hover:text-red-500 p-1.5 rounded transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                                <button onClick={onClose} className="hover:bg-muted p-1.5 rounded transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            {notifications.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 opacity-50">
                                    <Bell className="w-8 h-8" />
                                    <p className="text-xs">No new notifications</p>
                                </div>
                            ) : (
                                notifications.map((n) => (
                                    <motion.div
                                        key={n.id}
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        onClick={() => markNotificationRead(n.id)}
                                        className={`p-3 rounded-lg border flex gap-3 cursor-pointer transition-colors relative overflow-hidden group
                                            ${n.read ? 'bg-card/50 border-border opacity-70' : 'bg-card border-border/80 shadow-sm'}
                                        `}
                                    >
                                        <div className="mt-0.5">{getIcon(n.type)}</div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start">
                                                <h4 className={`text-xs font-semibold ${n.read ? 'text-muted-foreground' : 'text-foreground'}`}>{n.title}</h4>
                                                <span className="text-[9px] text-muted-foreground">
                                                    {n.timestamp.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                                {n.message}
                                            </p>
                                        </div>
                                        {!n.read && (
                                            <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-primary" />
                                        )}
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}