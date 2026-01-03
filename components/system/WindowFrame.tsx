
import React, { useState } from 'react';
import { motion, useDragControls, PanInfo } from "framer-motion";
import { Maximize2, Minimize2, X, Minus, Pin } from "lucide-react";
import { WindowState } from '../../types';
import { useSound } from '../../hooks/useSound';

interface WindowFrameProps {
    id: string;
    title: string;
    icon: any;
    children?: React.ReactNode;
    width: number;
    height: number;
    windowState: WindowState;
    onClose: (id: string) => void;
    onMinimize: (id: string) => void;
    onMaximize: (id: string) => void;
    onFocus: (id: string) => void;
    onSnap: (id: string, snap: 'left' | 'right' | 'top' | null) => void;
    onResize: (id: string, w: number, h: number) => void;
    onMove: (id: string, x: number, y: number) => void;
    onToggleAlwaysOnTop: (id: string) => void;
    activeWindowId: string | null;
    focusMode: boolean;
    constraintsRef: React.RefObject<Element>;
}

export const WindowFrame = ({ 
    id, title, icon: Icon, children, width: defaultWidth, height: defaultHeight, 
    windowState, onClose, onMinimize, onMaximize, onFocus, onSnap, onResize, onMove, onToggleAlwaysOnTop, 
    activeWindowId, focusMode, constraintsRef 
}: WindowFrameProps) => {
    
    if (!windowState || !windowState.isOpen) return null;
    if (focusMode && activeWindowId !== id) return null;

    const { play } = useSound();
    const HEADER_HEIGHT = 40; 
    
    const currentX = windowState.position?.x ?? (id === 'chat' ? 80 : 250);
    const currentY = windowState.position?.y ?? (id === 'chat' ? 80 : 100);
    const currentWidth = windowState.size?.width || defaultWidth;
    const currentHeight = windowState.size?.height || defaultHeight;

    const [isResizing, setIsResizing] = useState(false);
    const dragControls = useDragControls();
    const isActive = activeWindowId === id;
    const isDraggable = !windowState.isMaximized && !windowState.snap && !focusMode && !windowState.isMinimized;

    // --- Interaction Handlers with Sound ---
    const handleFocus = () => {
        if (!isActive) play('click');
        onFocus(id);
    };

    const handleMinimize = () => {
        play('click');
        onMinimize(id);
    };

    const handleMaximize = () => {
        play('click');
        onMaximize(id);
    };

    const handleClose = () => {
        play('close');
        onClose(id);
    };

    const handleSnap = (snap: 'left' | 'right' | 'top' | null) => {
        play('click');
        onSnap(id, snap);
    };

    // --- Resize Logic ---
    const handleResizeStart = (direction: 'corner' | 'right' | 'bottom') => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onFocus(id); 
        setIsResizing(true);

        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = typeof currentWidth === 'string' ? parseInt(currentWidth as any) : currentWidth;
        const startHeight = typeof currentHeight === 'string' ? parseInt(currentHeight as any) : currentHeight;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (focusMode || windowState.isMaximized || windowState.snap) return;
            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;
            let newWidth = startWidth;
            let newHeight = startHeight;

            if (direction === 'right' || direction === 'corner') newWidth = Math.max(300, startWidth + deltaX);
            if (direction === 'bottom' || direction === 'corner') newHeight = Math.max(200, startHeight + deltaY);

            onResize(id, newWidth, newHeight);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const getTargetState = () => {
        if (windowState.isMinimized) {
            return {
                position: 'absolute' as const,
                opacity: 0,
                scale: 0.5,
                y: typeof window !== 'undefined' ? window.innerHeight + 200 : 1000,
                x: currentX,
                transition: { duration: 0.4, ease: [0.32, 0.72, 0, 1] }
            };
        }

        if (focusMode) {
             return { 
                 position: 'fixed' as const,
                 x: "-50%", y: "-50%", top: "50%", left: "50%",
                 width: "min(90vw, 1200px)", height: "min(85vh, 900px)", 
                 borderRadius: '16px',
                 boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 100vw rgba(0,0,0,0.5)',
                 scale: 1, opacity: 1, zIndex: 9999
             };
        } 

        const screenW = typeof window !== 'undefined' ? window.innerWidth : 1920;
        const screenH = typeof window !== 'undefined' ? window.innerHeight : 1080;
        const margin = 8;
        const snapHeight = screenH - HEADER_HEIGHT - margin * 2;

        if (windowState.isMaximized || windowState.snap === 'top') {
            return { 
                position: 'absolute' as const, x: 0, y: 0, left: margin, top: HEADER_HEIGHT + margin,
                width: screenW - (margin * 2), height: snapHeight, borderRadius: '8px',
                scale: 1, opacity: 1, zIndex: windowState.isAlwaysOnTop ? windowState.zIndex + 2000 : windowState.zIndex
            };
        } 
        
        if (windowState.snap === 'left') {
            return { 
                position: 'absolute' as const, x: 0, y: 0, left: margin, top: HEADER_HEIGHT + margin,
                width: (screenW / 2) - (margin * 1.5), height: snapHeight, borderRadius: '8px',
                scale: 1, opacity: 1, zIndex: windowState.isAlwaysOnTop ? windowState.zIndex + 2000 : windowState.zIndex
            };
        } 
        
        if (windowState.snap === 'right') {
            return { 
                position: 'absolute' as const, x: 0, y: 0, left: (screenW / 2) + (margin * 0.5), top: HEADER_HEIGHT + margin,
                width: (screenW / 2) - (margin * 1.5), height: snapHeight, borderRadius: '8px',
                scale: 1, opacity: 1, zIndex: windowState.isAlwaysOnTop ? windowState.zIndex + 2000 : windowState.zIndex
            };
        }

        return {
            position: 'absolute' as const, opacity: 1, scale: 1, x: currentX, y: currentY, left: 0, top: 0,
            width: currentWidth, height: currentHeight, borderRadius: "12px",
            zIndex: windowState.isAlwaysOnTop ? windowState.zIndex + 2000 : windowState.zIndex,
            boxShadow: isActive ? "0 20px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(var(--primary), 0.3)" : "0 4px 12px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,255,255,0.05)",
            transition: { type: "spring", stiffness: 300, damping: 30 }
        };
    };

    const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        if (isDraggable) {
            onMove(id, currentX + info.offset.x, currentY + info.offset.y);
            
            const x = info.point.x;
            const y = info.point.y;
            const screenW = window.innerWidth;
            const SNAP_THRESHOLD = 50;

            if (y < SNAP_THRESHOLD) handleSnap('top');
            else if (x < SNAP_THRESHOLD) handleSnap('left');
            else if (x > screenW - SNAP_THRESHOLD) handleSnap('right');
        }
    };

    return (
        <motion.div
            key={id}
            initial={false}
            animate={getTargetState() as any}
            drag={isDraggable}
            dragControls={dragControls}
            dragListener={false} 
            dragConstraints={constraintsRef}
            dragMomentum={true}
            dragTransition={{ power: isActive ? 0.3 : 0.2, timeConstant: isActive ? 250 : 200 }}
            dragElastic={isActive ? 0.2 : 0.05}
            onDragStart={handleFocus}
            onDragEnd={handleDragEnd}
            whileDrag={{ scale: 1.01, zIndex: 9999, boxShadow: "0 30px 60px -15px rgba(0,0,0,0.5)", cursor: "grabbing" }}
            onPointerDown={handleFocus}
            className={`flex flex-col glass-panel overflow-hidden
                ${(windowState.snap || windowState.isMaximized || focusMode) ? '' : 'rounded-xl'}
                ${isActive ? 'bg-background/80 backdrop-blur-2xl ring-1 ring-primary/40' : 'bg-background/40 backdrop-blur-md border-white/5 opacity-90 hover:opacity-100'}
                ${focusMode ? 'shadow-2xl !border-none' : ''}
                ${isResizing ? 'pointer-events-none select-none transition-none' : ''} 
            `}
        >
            {!focusMode && (
                <div 
                    className={`h-10 shrink-0 flex items-center justify-between px-3 select-none border-b transition-colors duration-200
                        ${isActive ? 'bg-muted/40 border-primary/10 text-foreground' : 'bg-transparent border-border/40 text-muted-foreground'}
                        cursor-grab active:cursor-grabbing`}
                    onPointerDown={(e) => { handleFocus(); if(isDraggable) dragControls.start(e); }}
                    onDoubleClick={() => handleSnap(windowState.isMaximized ? null : 'top')}
                >
                    <div className="flex items-center gap-3 text-xs font-bold tracking-wide">
                        <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-primary' : 'opacity-70'}`} />
                        <span className="opacity-90">{title}</span>
                    </div>
                    
                    <div className="flex items-center gap-1.5 z-50" onPointerDown={(e) => e.stopPropagation()}>
                        <button onClick={() => onToggleAlwaysOnTop(id)} className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${windowState.isAlwaysOnTop ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'}`}>
                            <Pin className="w-3 h-3" />
                        </button>
                        <button onClick={handleMinimize} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"><Minus className="w-3 h-3" /></button>
                        <button onClick={() => handleSnap(windowState.isMaximized ? null : 'top')} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground">
                            {windowState.isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                        </button>
                        <button onClick={handleClose} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-destructive hover:text-destructive-foreground transition-colors text-muted-foreground"><X className="w-3 h-3" /></button>
                    </div>
                </div>
            )}
            
            {focusMode && (
                 <motion.button 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    onClick={handleClose} 
                    className="absolute top-4 right-4 z-50 p-2 rounded-full bg-black/40 hover:bg-destructive text-white transition-colors backdrop-blur-md border border-white/10 shadow-lg"
                 >
                    <X className="w-5 h-5" />
                 </motion.button>
            )}

            <div className={`flex-1 overflow-hidden relative ${isResizing ? 'pointer-events-none' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
                {!isActive && !focusMode && <div className="absolute inset-0 bg-background/10 backdrop-blur-[1px] pointer-events-none z-10 transition-all duration-300" />}
                {children}
            </div>

            {isDraggable && (
                <>
                    <div className="absolute top-0 bottom-6 right-0 w-2 cursor-ew-resize hover:bg-primary/20 transition-colors z-40" onMouseDown={handleResizeStart('right')} />
                    <div className="absolute bottom-0 left-0 right-6 h-2 cursor-ns-resize hover:bg-primary/20 transition-colors z-40" onMouseDown={handleResizeStart('bottom')} />
                    <div className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-50 group flex items-end justify-end p-1" onMouseDown={handleResizeStart('corner')}>
                        <div className={`w-3 h-3 rounded-sm transition-all duration-300 bg-border group-hover:bg-primary group-hover:scale-125 ${isActive ? 'opacity-100' : 'opacity-50'}`} />
                    </div>
                </>
            )}
        </motion.div>
    );
};
