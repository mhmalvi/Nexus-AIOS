
import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, AlertTriangle, CheckCircle, AlertOctagon, Lightbulb, X } from "lucide-react";
import { useStore } from "../../context/StoreContext";

const TOAST_DURATION = 4000;

const iconMap: Record<string, { icon: React.ElementType; color: string; accent: string }> = {
    success: { icon: CheckCircle, color: 'text-green-500', accent: 'border-green-500/30' },
    warning: { icon: AlertTriangle, color: 'text-orange-500', accent: 'border-orange-500/30' },
    error: { icon: AlertOctagon, color: 'text-red-500', accent: 'border-red-500/30' },
    insight: { icon: Lightbulb, color: 'text-purple-500', accent: 'border-purple-500/30' },
    info: { icon: Info, color: 'text-blue-500', accent: 'border-blue-500/30' },
};

export function ToastContainer() {
    const { toasts, removeToast } = useStore();

    return (
        <div className="fixed top-12 right-4 z-[90] flex flex-col gap-2 pointer-events-none w-80">
            <AnimatePresence>
                {toasts.map((toast) => (
                    <ToastItem key={toast.id} id={toast.id} title={toast.title} message={toast.message} type={toast.type} onDismiss={removeToast} />
                ))}
            </AnimatePresence>
        </div>
    );
}

function ToastItem({ id, title, message, type, onDismiss }: { id: string; title: string; message: string; type: string; onDismiss: (id: string) => void }) {
    useEffect(() => {
        const timer = setTimeout(() => onDismiss(id), TOAST_DURATION);
        return () => clearTimeout(timer);
    }, [id, onDismiss]);

    const config = iconMap[type] || iconMap.info;
    const Icon = config.icon;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: 80, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={`pointer-events-auto bg-card/95 backdrop-blur-xl border ${config.accent} rounded-xl shadow-2xl p-3 flex items-start gap-3 cursor-pointer group`}
            onClick={() => onDismiss(id)}
        >
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.color}`} />
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground/90 truncate">{title}</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2 mt-0.5">{message}</p>
            </div>
            <X className="w-3 h-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
        </motion.div>
    );
}
