/**
 * WindowBounds — Centralized window boundary engine.
 * Blends macOS-style fluid window management with GNOME's edge-tiling.
 * Supports: center, cascade, half-snap (L/R), maximize (top), quarter-snap (corners).
 */

// System geometry constants
export const HEADER_HEIGHT = 40;   // Slim top bar (macOS vibes)
export const DOCK_HEIGHT = 80;     // Floating dock clearance
export const STATUS_BAR_HEIGHT = 24; // Bottom status bar
export const MIN_WINDOW_WIDTH = 380;
export const MIN_WINDOW_HEIGHT = 260;
export const CASCADE_OFFSET = 32;
export const SNAP_EDGE_THRESHOLD = 5;   // px from edge to trigger snap
export const SNAP_CORNER_SIZE = 80;       // corner zone size for quarter-snap
export const WINDOW_GAP = 6;             // gap between snapped windows and edges

export type SnapZone = 'left' | 'right' | 'top' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | null;

export interface SafeWorkArea {
    top: number;
    left: number;
    width: number;
    height: number;
}

export interface Position {
    x: number;
    y: number;
}

export interface Size {
    width: number;
    height: number;
}

/**
 * Get the safe work area — canvas-relative coordinates.
 * top=0 is just below the header bar.
 * When dockAutoHide is true, windows can use space down to the status bar.
 */
export function getSafeWorkArea(screenW: number, screenH: number, dockAutoHide = false): SafeWorkArea {
    const dockClearance = dockAutoHide ? 0 : DOCK_HEIGHT;
    const totalChrome = HEADER_HEIGHT + dockClearance + STATUS_BAR_HEIGHT;
    return {
        top: 0,
        left: 0,
        width: screenW,
        height: Math.max(200, screenH - totalChrome),
    };
}

/**
 * Clamp a window position to keep it STRICTLY inside the canvas (work area).
 * Canvas-relative: y=0 is the top of the work area (just below the header).
 * The ENTIRE window must remain within the canvas — no part goes outside.
 */
export function clampWindowPosition(
    x: number, y: number, w: number, h: number,
    screenW: number, screenH: number, dockAutoHide = false
): Position {
    const workArea = getSafeWorkArea(screenW, screenH, dockAutoHide);

    // Strict containment: full window must stay within canvas bounds
    const clampedX = Math.max(0, Math.min(x, Math.max(0, workArea.width - w)));
    const clampedY = Math.max(0, Math.min(y, Math.max(0, workArea.height - h)));

    return { x: clampedX, y: clampedY };
}

/**
 * Clamp window size to fit the work area.
 */
export function clampWindowSize(
    w: number, h: number, screenW: number, screenH: number, dockAutoHide = false
): Size {
    const workArea = getSafeWorkArea(screenW, screenH, dockAutoHide);
    return {
        width: Math.max(MIN_WINDOW_WIDTH, Math.min(w, workArea.width)),
        height: Math.max(MIN_WINDOW_HEIGHT, Math.min(h, workArea.height)),
    };
}

/**
 * Get centered position within the work area.
 */
export function getCenterPosition(
    w: number, h: number, screenW: number, screenH: number, dockAutoHide = false
): Position {
    const workArea = getSafeWorkArea(screenW, screenH, dockAutoHide);
    return {
        x: Math.max(0, Math.round((workArea.width - w) / 2)),
        y: Math.max(0, Math.round((workArea.height - h) / 2)),
    };
}

/**
 * Centered cascade positioning — windows start at the center of the canvas
 * and each subsequent window is offset slightly down-right.
 * The cascade stays centered overall and wraps around to prevent overflow.
 */
export function getCascadePosition(
    index: number, w: number, h: number,
    screenW: number, screenH: number, dockAutoHide = false
): Position {
    const workArea = getSafeWorkArea(screenW, screenH, dockAutoHide);

    // Center of the canvas
    const centerX = Math.round((workArea.width - w) / 2);
    const centerY = Math.round((workArea.height - h) / 2);

    // Maximum cascade steps before wrapping
    const maxSteps = Math.min(6, Math.floor(Math.min(centerX, centerY) / CASCADE_OFFSET));
    const step = maxSteps > 0 ? (index % maxSteps) : 0;

    // Offset from center diagonally
    const rawX = centerX + step * CASCADE_OFFSET;
    const rawY = centerY + step * CASCADE_OFFSET;

    return clampWindowPosition(rawX, rawY, w, h, screenW, screenH, dockAutoHide);
}

/**
 * Detect which snap zone the pointer is in.
 * Returns the snap zone or null if no zone is triggered.
 */
export function detectSnapZone(
    pointerX: number, pointerY: number,
    screenW: number, screenH: number
): SnapZone {
    // User requested "Flexible and free" — Snapping disabled for drag operations
    // Maximize button still works via window controls
    return null;
}

/**
 * Get dimensions for a specific snap zone.
 * All values are canvas-relative (y=0 is the top of the work area, below the header).
 * Windows are rendered with position: absolute inside the canvas container.
 */
export function getSnapDimensions(
    zone: SnapZone, screenW: number, screenH: number, dockAutoHide = false
): { position: Position; size: Size } | null {
    if (!zone) return null;

    const g = WINDOW_GAP;
    const canvasTop = 0; // Canvas-relative: top of canvas is y=0
    const dockClearance = dockAutoHide ? 0 : DOCK_HEIGHT;
    const canvasH = screenH - HEADER_HEIGHT - dockClearance - STATUS_BAR_HEIGHT;
    const halfW = Math.floor((screenW - g * 3) / 2);
    const halfH = Math.floor((canvasH - g * 3) / 2);

    switch (zone) {
        case 'top': // Maximize — fill entire canvas, no gaps
            return {
                position: { x: 0, y: canvasTop },
                size: { width: screenW, height: canvasH },
            };
        case 'left':
            return {
                position: { x: g, y: canvasTop + g },
                size: { width: halfW, height: canvasH - g * 2 },
            };
        case 'right':
            return {
                position: { x: g * 2 + halfW, y: canvasTop + g },
                size: { width: halfW, height: canvasH - g * 2 },
            };
        case 'top-left':
            return {
                position: { x: g, y: canvasTop + g },
                size: { width: halfW, height: halfH },
            };
        case 'top-right':
            return {
                position: { x: g * 2 + halfW, y: canvasTop + g },
                size: { width: halfW, height: halfH },
            };
        case 'bottom-left':
            return {
                position: { x: g, y: canvasTop + g * 2 + halfH },
                size: { width: halfW, height: halfH },
            };
        case 'bottom-right':
            return {
                position: { x: g * 2 + halfW, y: canvasTop + g * 2 + halfH },
                size: { width: halfW, height: halfH },
            };
        default:
            return null;
    }
}

/**
 * Drag constraints for framer-motion — strict canvas containment.
 * The full window must remain within the canvas at all times.
 */
export function getDragConstraints(
    w: number, h: number, screenW: number, screenH: number, dockAutoHide = false
): { top: number; bottom: number; left: number; right: number } {
    const workArea = getSafeWorkArea(screenW, screenH, dockAutoHide);
    return {
        top: 0,
        bottom: Math.max(0, workArea.height - h),
        left: 0,
        right: Math.max(0, workArea.width - w),
    };
}

/**
 * Check if a window is dangerously off-screen.
 */
export function isWindowOffScreen(
    x: number, y: number, w: number, h: number,
    screenW: number, screenH: number
): boolean {
    const THRESHOLD = 60;
    return y < 0 || x + w < THRESHOLD || x > screenW - THRESHOLD;
}

/**
 * Get maximized window dimensions.
 */
export function getMaximizedDimensions(screenW: number, screenH: number, dockAutoHide = false) {
    return getSnapDimensions('top', screenW, screenH, dockAutoHide)!;
}

/**
 * Get snap-left window dimensions.
 */
export function getSnapLeftDimensions(screenW: number, screenH: number, dockAutoHide = false) {
    return getSnapDimensions('left', screenW, screenH, dockAutoHide)!;
}

/**
 * Get snap-right window dimensions.
 */
export function getSnapRightDimensions(screenW: number, screenH: number, dockAutoHide = false) {
    return getSnapDimensions('right', screenW, screenH, dockAutoHide)!;
}
