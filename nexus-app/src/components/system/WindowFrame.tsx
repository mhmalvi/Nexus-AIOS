
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, useDragControls, PanInfo, AnimatePresence, useMotionValue } from "framer-motion";
import { Maximize2, Minimize2, X, Minus, Pin, Plus, Columns } from "lucide-react";
import { WindowState } from '../../types';
import { useStore } from '../../context/StoreContext';
import { useSound } from '../../hooks/useSound';
import {
    HEADER_HEIGHT,
    DOCK_HEIGHT,
    STATUS_BAR_HEIGHT,
    MIN_WINDOW_WIDTH,
    MIN_WINDOW_HEIGHT,
    WINDOW_GAP,
    getSafeWorkArea,
    clampWindowPosition,
    clampWindowSize,
    getCenterPosition,
    getDragConstraints,
    isWindowOffScreen,
    detectSnapZone,
    getSnapDimensions,
    SnapZone,
} from '../../services/WindowBounds';

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
    onSnap: (id: string, snap: 'left' | 'right' | 'top' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | null) => void;
    onResize: (id: string, w: number, h: number) => void;
    onMove: (id: string, x: number, y: number) => void;
    onToggleAlwaysOnTop: (id: string) => void;
    activeWindowId: string | null;
    focusMode: boolean;
    constraintsRef: React.RefObject<Element>;
    variant?: 'default' | 'ghost';
}

/* ─── Traffic Light Button (macOS-style) ─── */
const TrafficLight = ({
    color,
    onClick,
    hoverIcon: HoverIcon,
    groupHovered,
}: {
    color: 'close' | 'minimize' | 'maximize';
    onClick: () => void;
    hoverIcon?: any;
    groupHovered: boolean;
}) => {
    const colorMap = {
        close: { bg: 'bg-[#FF5F57]', hoverBg: 'hover:bg-[#FF5F57]', shadow: 'shadow-[0_0_4px_rgba(255,95,87,0.4)]' },
        minimize: { bg: 'bg-[#FEBC2E]', hoverBg: 'hover:bg-[#FEBC2E]', shadow: 'shadow-[0_0_4px_rgba(254,188,46,0.4)]' },
        maximize: { bg: 'bg-[#28C840]', hoverBg: 'hover:bg-[#28C840]', shadow: 'shadow-[0_0_4px_rgba(40,200,64,0.4)]' },
    };

    const c = colorMap[color];

    return (
        <button
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`w-[13px] h-[13px] rounded-full flex items-center justify-center transition-all duration-150 ${c.bg} ${c.shadow} hover:brightness-110 active:brightness-90`}
        >
            {groupHovered && HoverIcon && (
                <HoverIcon className="w-[8px] h-[8px] text-black/70" strokeWidth={2.5} />
            )}
        </button>
    );
};

/* ─── Snap Preview Overlay ─── */
const SnapPreviewOverlay = ({ zone, screenW, screenH, dockAutoHide }: { zone: SnapZone; screenW: number; screenH: number; dockAutoHide?: boolean }) => {
    if (!zone) return null;
    const dims = getSnapDimensions(zone, screenW, screenH, dockAutoHide);
    if (!dims) return null;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className="fixed z-[1998] rounded-xl overflow-hidden"
            style={{
                left: dims.position.x,
                top: HEADER_HEIGHT + dims.position.y,
                width: dims.size.width,
                height: dims.size.height,
            }}
        >
            {/* Glassy preview area */}
            <div className="absolute inset-0 bg-primary/20 backdrop-blur-sm border-2 border-primary/60 rounded-xl" />
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-xl" />
        </motion.div>
    );
};

/* ─── Main Window Frame ─── */
export const WindowFrame = ({
    id, title, icon: Icon, children, width: defaultWidth, height: defaultHeight,
    windowState, onClose, onMinimize, onMaximize, onFocus, onSnap, onResize, onMove, onToggleAlwaysOnTop,
    activeWindowId, focusMode, constraintsRef, variant = 'default'
}: WindowFrameProps) => {

    if (!windowState || !windowState.isOpen) return null;
    if (focusMode && activeWindowId !== id) return null;

    const { play } = useSound();
    const { ui } = useStore();
    const dockAutoHide = ui.dockAutoHide;

    // Screen dimensions
    const [screenDims, setScreenDims] = useState({
        width: typeof window !== 'undefined' ? window.innerWidth : 1920,
        height: typeof window !== 'undefined' ? window.innerHeight : 1080
    });

    useEffect(() => {
        const handleResize = () => setScreenDims({ width: window.innerWidth, height: window.innerHeight });
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const screenW = screenDims.width;
    const screenH = screenDims.height;
    const workArea = getSafeWorkArea(screenW, screenH, dockAutoHide);

    // Compute current size — clamped to fit within canvas
    const centerPos = getCenterPosition(defaultWidth, defaultHeight, screenW, screenH, dockAutoHide);
    const currentWidth = Math.min(windowState.size?.width || defaultWidth, workArea.width);
    const currentHeight = Math.min(windowState.size?.height || defaultHeight, workArea.height);

    // Compute current position — centered if no saved position, otherwise clamped
    const hasPos = windowState.position && typeof windowState.position.x === 'number' && typeof windowState.position.y === 'number';
    const maxX = Math.max(0, workArea.width - currentWidth);
    // STRICT: Window must stay above the dock (match StoreContext)
    const maxY = Math.max(0, workArea.height - currentHeight);
    const currentX = hasPos
        ? Math.max(0, Math.min(windowState.position!.x, maxX))
        : Math.max(0, Math.min(centerPos.x, maxX));
    const currentY = hasPos
        ? Math.max(0, Math.min(windowState.position!.y, maxY))
        : Math.max(0, Math.min(centerPos.y, maxY));


    // Interaction state
    const [isResizing, setIsResizing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [snapPreview, setSnapPreview] = useState<SnapZone>(null);
    const [titleBarHovered, setTitleBarHovered] = useState(false);
    const dragControls = useDragControls();
    const isActive = activeWindowId === id;
    const isDraggable = !focusMode && !windowState.isMinimized;

    // Motion values are DRAG OFFSETS only (start at 0, reset after drag)
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    // Native framer-motion drag constraints — computed as offsets from current position
    // These tell framer-motion how far the motion values (x, y) can go from 0
    const dragConstraintsMemo = useMemo(() => {
        if (windowState.isMaximized || windowState.snap) {
            // When snapped/maximized, allow free drag to break out of snap.
            // Canvas overflow:hidden clips any visual overflow; handleDragEnd clamps the final position.
            return undefined;
        }
        return {
            left: -currentX,                // can drag left until absolute x = 0
            right: maxX - currentX,          // can drag right until absolute x = maxX
            top: -currentY,                  // can drag up until absolute y = 0
            bottom: maxY - currentY,          // can drag down until absolute y = maxY
        };
    }, [currentX, currentY, maxX, maxY, windowState.isMaximized, windowState.snap]);

    // Reset drag offsets when position updates from state
    useEffect(() => {
        if (!isDragging) {
            x.set(0);
            y.set(0);
        }
    }, [currentX, currentY, isDragging]);

    // Handlers
    const handleFocus = useCallback(() => {
        if (!isActive) play('click');
        onFocus(id);
    }, [isActive, id, onFocus, play]);

    const handleMinimize = useCallback(() => {
        play('click');
        onMinimize(id);
    }, [id, onMinimize, play]);

    const handleMaximize = useCallback(() => {
        play('click');
        onSnap(id, windowState.isMaximized ? null : 'top');
    }, [id, windowState.isMaximized, onSnap, play]);

    const handleClose = useCallback(() => {
        play('close');
        onClose(id);
    }, [id, onClose, play]);

    // Safety: ensure window fits on screen — DISABLED to prevent snapping
    // The initial placement (getCascadePosition) and manual drag (clamped) are trusted.
    // This effect was causing existing windows to "snap" when new ones opened or on re-renders.
    /*
    useEffect(() => {
        if (!windowState.isOpen || windowState.isMaximized || windowState.snap || windowState.isMinimized || isDragging || isResizing) return;
        const needsFix = currentY < 0; // || isWindowOffScreen(...)
        if (!needsFix) return;
        // ...
    }, [...]);
    */

    // DEBUG OVERLAY
    const debugInfo = (
        <div className="fixed top-0 left-0 bg-black/80 text-white text-[10px] p-1 z-[99999] pointer-events-none whitespace-pre font-mono">
            {`ID:${id.slice(0, 4)} X:${Math.round(currentX)} Y:${Math.round(currentY)} W:${Math.round(currentWidth)} H:${Math.round(currentHeight)} S:${screenW}x${screenH}`}
        </div>
    );

    // ─── Enhanced Resize with all 8 edges/corners ───
    const handleResizeStart = (direction: string) => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onFocus(id);
        setIsResizing(true);

        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = currentWidth;
        const startHeight = currentHeight;
        const startPosX = currentX;
        const startPosY = currentY;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (focusMode || windowState.isMaximized || windowState.snap) return;

            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;
            let newWidth = startWidth;
            let newHeight = startHeight;
            let newX = startPosX;
            let newY = startPosY;

            if (direction.includes('right') || direction === 'se' || direction === 'ne') {
                newWidth = Math.max(MIN_WINDOW_WIDTH, Math.min(startWidth + deltaX, workArea.width - newX));
            }
            if (direction.includes('bottom') || direction === 'se' || direction === 'sw') {
                newHeight = Math.max(MIN_WINDOW_HEIGHT, Math.min(startHeight + deltaY, workArea.height - newY));
            }
            if (direction.includes('left') || direction === 'sw' || direction === 'nw') {
                const possibleWidth = startWidth - deltaX;
                if (possibleWidth >= MIN_WINDOW_WIDTH) {
                    const clampedX = Math.max(0, startPosX + deltaX);
                    newWidth = startWidth + (startPosX - clampedX);
                    newX = clampedX;
                }
            }
            if (direction.includes('top') || direction === 'ne' || direction === 'nw') {
                const possibleHeight = startHeight - deltaY;
                if (possibleHeight >= MIN_WINDOW_HEIGHT) {
                    const clampedY = Math.max(0, startPosY + deltaY);
                    newHeight = startHeight + (startPosY - clampedY);
                    newY = clampedY;
                }
            }

            onResize(id, newWidth, newHeight);
            if (newX !== startPosX || newY !== startPosY) onMove(id, newX, newY);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
        };

        const cursorMap: Record<string, string> = {
            right: 'ew-resize', left: 'ew-resize',
            top: 'ns-resize', bottom: 'ns-resize',
            se: 'nwse-resize', sw: 'nesw-resize',
            ne: 'nesw-resize', nw: 'nwse-resize',
        };
        document.body.style.cursor = cursorMap[direction] || 'default';
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    // ─── Compute position/size for current state ───
    const getPositionStyle = (): React.CSSProperties => {
        if (windowState.isMinimized) {
            return {
                position: 'absolute',
                left: screenW / 2 - currentWidth / 2,
                top: workArea.height,
                width: currentWidth,
                height: currentHeight,
                pointerEvents: 'none',
                zIndex: windowState.zIndex,
            };
        }

        if (focusMode) {
            return {
                position: 'fixed',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 'min(94vw, 1500px)',
                height: 'min(90vh, 1050px)',
                borderRadius: '14px',
                boxShadow: '0 50px 100px -20px rgba(0,0,0,0.7), 0 0 0 100vw rgba(0,0,0,0.65)',
                zIndex: 9999,
            };
        }

        if (windowState.isMaximized || windowState.snap) {
            const zone = windowState.snap || 'top';
            const dims = getSnapDimensions(zone as any, screenW, screenH, dockAutoHide);
            if (dims) {
                const isFullscreen = zone === 'top';
                return {
                    position: 'absolute',
                    left: dims.position.x,
                    top: dims.position.y, // Removed unnecessary HEADER_HEIGHT subtraction
                    width: dims.size.width,
                    height: dims.size.height,
                    borderRadius: isFullscreen ? '0px' : '10px',
                    zIndex: windowState.isAlwaysOnTop ? Math.min(windowState.zIndex + 1000, 1999) : windowState.zIndex,
                };
            }
        }

        // Normal floating
        return {
            position: 'absolute',
            left: Math.round(currentX),
            top: Math.round(currentY),
            width: Math.round(currentWidth),
            height: Math.round(currentHeight),
            borderRadius: '12px',
            zIndex: windowState.isAlwaysOnTop ? Math.min(windowState.zIndex + 1000, 1999) : windowState.zIndex,
            boxShadow: isActive
                ? '0 25px 60px -12px rgba(0,0,0,0.3), 0 0 0 1px hsl(var(--border))'
                : '0 8px 32px -8px rgba(0,0,0,0.15), 0 0 0 1px hsl(var(--border)/0.5)',
        };
    };

    // ─── Drag Handlers ───
    // Drag clamping is handled natively by framer-motion via dragConstraints.
    // handleDrag is kept only for snap preview detection (currently disabled).
    const handleDrag = (_event: MouseEvent | TouchEvent | PointerEvent, _info: PanInfo) => {
        // Snap preview detection would go here if enabled
    };

    const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        setTimeout(() => setIsDragging(false), 50);

        if (isDraggable) {
            let absX: number;
            let absY: number;

            if (windowState.isMaximized || windowState.snap) {
                // Smart restore from snap: use snap position as base (not stored position)
                const zone = windowState.snap || 'top';
                const dims = getSnapDimensions(zone as any, screenW, screenH, dockAutoHide);
                const snapX = dims?.position.x ?? 0;
                const snapY = dims?.position.y ?? 0;
                const snapW = dims?.size.width ?? screenW;

                // Visual position during snap drag
                const visualX = snapX + x.get();
                absY = snapY + y.get();

                // Keep mouse at same relative X position within the restored window
                const mouseX = info.point.x;
                const relativeX = Math.max(0, Math.min(1, (mouseX - visualX) / snapW));
                absX = mouseX - (relativeX * currentWidth);

                onSnap(id, null);
            } else {
                absX = currentX + x.get();
                absY = currentY + y.get();
            }

            // Clamp final absolute position — full window must stay within canvas
            const clampedX = Math.max(0, Math.min(absX, maxX));
            const clampedY = Math.max(0, Math.min(absY, maxY));
            onMove(id, clampedX, clampedY);
            // Reset drag offset (position now in state via onMove)
            x.set(0);
            y.set(0);
        }

        setSnapPreview(null);
    };

    const handleDragStart = () => {
        setIsDragging(true);
        handleFocus();
    };

    return (
        <>
            {/* Snap Preview Overlay */}
            <AnimatePresence>
                {snapPreview && isDragging && (
                    <SnapPreviewOverlay zone={snapPreview} screenW={screenW} screenH={screenH} dockAutoHide={dockAutoHide} />
                )}
            </AnimatePresence>

            {/* {isActive && debugInfo} */}

            {/* Outer div: handles CSS positioning ONLY — no Framer Motion interference */}
            <div
                style={getPositionStyle()}
                data-testid={`window-frame-${id}`}
            >
                {/* Inner motion.div: handles drag offset + open/close animation ONLY */}
                <motion.div
                    key={id}
                    layout={false}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: windowState.isMinimized ? 0 : 1, scale: windowState.isMinimized ? 0.2 : 1 }}
                    exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.18, ease: 'easeIn' } }}
                    transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.8 }}
                    drag={isDraggable}
                    dragControls={dragControls}
                    dragConstraints={dragConstraintsMemo}
                    dragListener={false}
                    dragMomentum={false}
                    dragElastic={0}
                    onDrag={handleDrag}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    whileDrag={{
                        scale: 1.01,
                        zIndex: 1999,
                        boxShadow: "0 40px 80px -15px rgba(0,0,0,0.25)",
                        cursor: "grabbing"
                    }}
                    onPointerDown={handleFocus}
                    className={`w-full h-full flex flex-col overflow-hidden text-foreground
                        ${(windowState.snap || windowState.isMaximized || focusMode) ? 'rounded-[10px]' : 'rounded-xl'}
                        ${variant === 'ghost'
                            ? 'bg-background/90 backdrop-blur-3xl border border-border/20'
                            : isActive
                                ? 'bg-card/95 backdrop-blur-2xl ring-1 ring-ring/10'
                                : 'bg-card/80 backdrop-blur-xl border border-border/50 opacity-95'
                        }
                        ${(windowState.isMaximized || windowState.snap) ? '!border-0' : ''}
                        ${isResizing ? 'transition-none' : 'transition-shadow duration-300'}
                    `}
                    style={{ x, y }}
                >
                    {/* ─── macOS-style Title Bar ─── */}
                    {variant !== 'ghost' && (
                        <div
                            className={`h-[38px] min-h-[38px] shrink-0 z-50 flex items-center px-3.5 select-none transition-all duration-200
                            ${isActive
                                    ? 'bg-muted border-b-2 border-border backdrop-blur-xl'
                                    : 'bg-muted/80 border-b border-border/60 backdrop-blur-sm'
                                }
                            cursor-grab active:cursor-grabbing`}
                            onPointerDown={(e) => { handleFocus(); if (isDraggable) dragControls.start(e); }}
                            onDoubleClick={handleMaximize}
                            onMouseEnter={() => setTitleBarHovered(true)}
                            onMouseLeave={() => setTitleBarHovered(false)}
                        >
                            {/* Traffic Lights — macOS left side */}
                            <div className="flex items-center gap-[7px] mr-3.5">
                                <TrafficLight color="close" onClick={handleClose} hoverIcon={X} groupHovered={titleBarHovered} />
                                <TrafficLight color="minimize" onClick={handleMinimize} hoverIcon={Minus} groupHovered={titleBarHovered} />
                                <TrafficLight color="maximize" onClick={handleMaximize} hoverIcon={windowState.isMaximized ? Columns : Plus} groupHovered={titleBarHovered} />
                            </div>

                            {/* Centered Title */}
                            <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
                                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-foreground/70' : 'text-muted-foreground/50'}`} />
                                <span className={`text-[12px] font-medium truncate ${isActive ? 'text-foreground/90' : 'text-muted-foreground/60'}`}>
                                    {title}
                                </span>
                            </div>

                            {/* Right side — Pin */}
                            <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
                                <button
                                    onClick={() => onToggleAlwaysOnTop(id)}
                                    className={`w-6 h-6 flex items-center justify-center rounded-md transition-all
                                    ${windowState.isAlwaysOnTop
                                            ? 'text-primary bg-primary/15'
                                            : 'text-muted-foreground/30 hover:text-muted-foreground/60 hover:bg-muted/10'
                                        }`}
                                >
                                    <Pin className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Ghost variant header */}
                    {variant === 'ghost' && !focusMode && (
                        <div
                            className="absolute top-0 left-0 right-0 h-8 z-50 cursor-grab active:cursor-grabbing"
                            onPointerDown={(e) => { handleFocus(); if (isDraggable) dragControls.start(e); }}
                        >
                            <button
                                onClick={handleClose}
                                className="absolute top-2 right-2 p-1.5 rounded-full bg-background/5 hover:bg-destructive/30 text-muted-foreground hover:text-foreground transition-all opacity-0 group-hover:opacity-100"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}

                    {/* Focus mode close */}
                    {focusMode && (
                        <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            onClick={handleClose}
                            className="absolute top-3 right-3 z-50 p-2 rounded-full bg-background/50 hover:bg-destructive text-foreground transition-all backdrop-blur-md border border-border shadow-lg"
                        >
                            <X className="w-4 h-4" />
                        </motion.button>
                    )}

                    {/* ─── Content Area ─── */}
                    <div
                        className={`flex-1 w-full min-h-0 overflow-hidden relative ${isResizing ? 'pointer-events-none select-none' : ''}`}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        {/* Inactive dimming overlay */}
                        {!isActive && !focusMode && (
                            <div className="absolute inset-0 bg-background/[0.05] pointer-events-none z-10 transition-opacity duration-300" />
                        )}
                        {children}
                    </div>

                    {/* ─── Resize Handles (8-direction) ─── */}
                    {isDraggable && variant !== 'ghost' && !windowState.isMaximized && !windowState.snap && (
                        <>
                            {/* Edges */}
                            <div className="absolute top-[38px] bottom-3 right-[-3px] w-[6px] cursor-ew-resize z-40 hover:bg-primary/20 transition-colors" onMouseDown={handleResizeStart('right')} />
                            <div className="absolute top-[38px] bottom-3 left-[-3px] w-[6px] cursor-ew-resize z-40 hover:bg-primary/20 transition-colors" onMouseDown={handleResizeStart('left')} />
                            <div className="absolute bottom-[-3px] left-3 right-3 h-[6px] cursor-ns-resize z-40 hover:bg-primary/20 transition-colors" onMouseDown={handleResizeStart('bottom')} />
                            <div className="absolute top-[-3px] left-10 right-10 h-[6px] cursor-ns-resize z-50 hover:bg-primary/20 transition-colors" onMouseDown={handleResizeStart('top')} />

                            {/* Corners */}
                            <div className="absolute bottom-[-4px] right-[-4px] w-5 h-5 cursor-nwse-resize z-50" onMouseDown={handleResizeStart('se')}>
                                <div className="absolute bottom-[4px] right-[4px] w-[10px] h-[10px] rounded-br border-b-2 border-r-2 border-border/20 hover:border-primary/50 transition-colors" />
                            </div>
                            <div className="absolute bottom-[-4px] left-[-4px] w-5 h-5 cursor-nesw-resize z-50" onMouseDown={handleResizeStart('sw')} />
                            <div className="absolute top-[-4px] right-[-4px] w-5 h-5 cursor-nesw-resize z-50" onMouseDown={handleResizeStart('ne')} />
                            <div className="absolute top-[-4px] left-[-4px] w-5 h-5 cursor-nwse-resize z-50" onMouseDown={handleResizeStart('nw')} />
                        </>
                    )}
                </motion.div>
            </div>
        </>
    );
};
