import React, { useRef, useEffect, useState, useMemo } from "react";
import { Brain, Share2, FileText, Link2, Database, Search, ZoomIn, ZoomOut, Move, X, Filter, Cpu, Layers, Activity, ChevronDown, Sparkles, Plus, Trash2, Save } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../context/StoreContext";

interface Node {
    id: number;
    dbId?: string;
    label: string;
    tier: 1 | 2 | 3;
    type: 'core' | 'tool' | 'memory' | 'data';
    description: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    connections: number;
}

interface Link {
    from: number;
    to: number;
}

import tauriApi from '../../services/tauriApi';

export function MemoryViewer() {
    const canvasRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

    const [isDragging, setIsDragging] = useState<{ id: number; startX: number; startY: number } | null>(null);
    const [isPanning, setIsPanning] = useState<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [hoveredNode, setHoveredNode] = useState<number | null>(null);

    const [searchQuery, setSearchQuery] = useState("");
    const [activeTiers, setActiveTiers] = useState<number[]>([1, 2, 3]);

    const [nodes, setNodes] = useState<Node[]>([]);
    const { addNotification } = useStore();

    // CRUD State
    const [showAddModal, setShowAddModal] = useState(false);
    const [newMemoryContent, setNewMemoryContent] = useState("");
    const [newMemoryTier, setNewMemoryTier] = useState<"short_term" | "long_term">("short_term");

    const fetchMemory = async () => {
        try {
            const result = await tauriApi.memory.query(searchQuery || "", "all", 20);
            if (result.success && result.results) {
                // Map backend memory entries to visualizer nodes
                const memoryNodes: Node[] = result.results.map((entry, index) => ({
                    id: index + 10, // Offset to avoid collision with core nodes
                    dbId: entry.id,
                    label: entry.content.substring(0, 20) + (entry.content.length > 20 ? "..." : ""),
                    tier: entry.tier === 'short_term' ? 1 : entry.tier === 'long_term' ? 2 : 3,
                    type: entry.metadata?.type === 'tool' ? 'tool' : 'memory',
                    description: entry.content,
                    domain: entry.domain,
                    category: entry.category,
                    x: 50 + (Math.random() * 80 - 40),
                    y: 50 + (Math.random() * 80 - 40),
                    vx: 0,
                    vy: 0,
                    connections: 1
                }));

                // Merge with core nodes (keep core nodes stable)
                setNodes(prev => {
                    const coreNodes = prev.filter(n => n.type === 'core' || n.id < 10);
                    if (coreNodes.length === 0) {
                        return [
                            { id: 1, label: "Active Context", tier: 1, type: 'core', description: "Live execution context.", x: 50, y: 50, vx: 0, vy: 0, connections: 4 },
                            { id: 2, label: "Thought Buffer", tier: 1, type: 'memory', description: "Short-term stream.", x: 55, y: 45, vx: 0, vy: 0, connections: 2 },
                            ...memoryNodes
                        ];
                    }
                    return [...coreNodes, ...memoryNodes];
                });
            }
        } catch (err) {
            console.error("Failed to fetch memory:", err);
        }
    };

    useEffect(() => {
        fetchMemory();
    }, [searchQuery]);

    const handleAddMemory = async () => {
        if (!newMemoryContent.trim()) return;
        try {
            await tauriApi.memory.store(newMemoryContent, newMemoryTier, { type: 'manual' });
            addNotification({ title: "Memory Stored", message: "Added to neural cortex.", type: "success" });
            setNewMemoryContent("");
            setShowAddModal(false);
            fetchMemory();
        } catch (e) {
            addNotification({ title: "Error", message: "Failed to store memory.", type: "error" });
        }
    };

    const handleDeleteMemory = async () => {
        if (!selectedNode || !selectedNode.dbId) return;
        try {
            await tauriApi.memory.delete(selectedNode.dbId);
            addNotification({ title: "Memory Deleted", message: "Removed from neural cortex.", type: "success" });
            setSelectedNode(null);
            fetchMemory();
        } catch (e) {
            addNotification({ title: "Error", message: "Failed to delete memory.", type: "error" });
        }
    };

    const links: Link[] = [
        { from: 1, to: 2 }, { from: 1, to: 3 }, { from: 1, to: 4 },
        { from: 2, to: 5 }, { from: 3, to: 1 }, { from: 4, to: 8 },
        { from: 6, to: 1 }, { from: 7, to: 5 }
    ];

    const filteredNodes = useMemo(() => {
        return nodes.filter(n =>
            n.label.toLowerCase().includes(searchQuery.toLowerCase()) &&
            activeTiers.includes(n.tier)
        );
    }, [nodes, searchQuery, activeTiers]);

    const toggleTier = (tier: number) => {
        setActiveTiers(prev => prev.includes(tier) ? prev.filter(t => t !== tier) : [...prev, tier]);
    };

    const isVisible = (id: number) => filteredNodes.some(n => n.id === id);

    // Physics Simulation
    useEffect(() => {
        let frameId: number;
        const simulate = () => {
            setNodes(prev => {
                const next = prev.map(n => ({ ...n }));
                const center = { x: 50, y: 50 };

                for (let i = 0; i < next.length; i++) {
                    const n = next[i];
                    if (isDragging && isDragging.id === n.id) continue;

                    // Repulsion
                    for (let j = i + 1; j < next.length; j++) {
                        const other = next[j];
                        const dx = n.x - other.x;
                        const dy = n.y - other.y;
                        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
                        const force = 1.5 / dist;
                        n.vx += (dx / dist) * force * 0.05;
                        n.vy += (dy / dist) * force * 0.05;
                        other.vx -= (dx / dist) * force * 0.05;
                        other.vy -= (dy / dist) * force * 0.05;
                    }

                    // Gravity to center
                    const dx = n.x - center.x;
                    const dy = n.y - center.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const pull = dist * 0.0005;
                    n.vx -= dx * pull;
                    n.vy -= dy * pull;

                    // Damping
                    n.vx *= 0.94;
                    n.vy *= 0.94;

                    n.x += n.vx;
                    n.y += n.vy;
                }
                return next;
            });
            frameId = requestAnimationFrame(simulate);
        };
        simulate();
        return () => cancelAnimationFrame(frameId);
    }, [isDragging]);

    const handleMouseDown = (e: React.MouseEvent, nodeId?: number) => {
        e.stopPropagation();
        if (nodeId) {
            setIsDragging({ id: nodeId, startX: e.clientX, startY: e.clientY });
            setSelectedNode(nodes.find(n => n.id === nodeId) || null);
        } else {
            setIsPanning({ startX: e.clientX, startY: e.clientY, initialX: transform.x, initialY: transform.y });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            const factor = 1 / transform.k;
            const dx = (e.clientX - isDragging.startX) * factor * 0.1;
            const dy = (e.clientY - isDragging.startY) * factor * 0.1;
            setNodes(prev => prev.map(n => n.id === isDragging.id ? { ...n, x: n.x + dx, y: n.y + dy } : n));
            setIsDragging({ ...isDragging, startX: e.clientX, startY: e.clientY });
        } else if (isPanning) {
            setTransform(prev => ({ ...prev, x: isPanning.initialX + (e.clientX - isPanning.startX), y: isPanning.initialY + (e.clientY - isPanning.startY) }));
        }
    };

    const handleMouseUp = () => { setIsDragging(null); setIsPanning(null); };

    const getNodeColor = (type: string) => {
        switch (type) {
            case 'core': return 'text-primary shadow-[0_0_15px_rgba(var(--primary),0.6)]';
            case 'tool': return 'text-nexus-tool shadow-[0_0_10px_rgba(50,215,75,0.4)]';
            case 'memory': return 'text-nexus-memory shadow-[0_0_10px_rgba(191,90,242,0.4)]';
            default: return 'text-foreground';
        }
    };

    return (
        <div
            className="h-full flex flex-col bg-black relative overflow-hidden text-foreground select-none"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {/* Starfield Background */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0a0a] to-black z-0 pointer-events-none" />
            <div className="absolute inset-0 opacity-20 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] pointer-events-none" />

            {/* Controls Overlay */}
            <div className="absolute top-4 left-4 z-20 flex gap-2">
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-lg p-1.5 flex items-center gap-2">
                    <Search className="w-4 h-4 text-muted-foreground ml-1" />
                    <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search memory..."
                        className="bg-transparent border-none focus:outline-none text-xs text-white placeholder:text-muted-foreground w-32"
                    />
                </div>
                <button onClick={() => setTransform({ x: 0, y: 0, k: 1 })} className="bg-white/5 backdrop-blur-md border border-white/10 p-1.5 rounded-lg text-muted-foreground hover:text-white transition-colors" title="Reset View">
                    <Move className="w-4 h-4" />
                </button>
                <button onClick={() => setTransform(t => ({ ...t, k: Math.min(4, t.k + 0.3) }))} className="bg-white/5 backdrop-blur-md border border-white/10 p-1.5 rounded-lg text-muted-foreground hover:text-white transition-colors" title="Zoom In">
                    <ZoomIn className="w-4 h-4" />
                </button>
                <button onClick={() => setTransform(t => ({ ...t, k: Math.max(0.2, t.k - 0.3) }))} className="bg-white/5 backdrop-blur-md border border-white/10 p-1.5 rounded-lg text-muted-foreground hover:text-white transition-colors" title="Zoom Out">
                    <ZoomOut className="w-4 h-4" />
                </button>
                <button onClick={() => setShowAddModal(true)} className="bg-primary/20 backdrop-blur-md border border-primary/50 p-1.5 rounded-lg text-primary hover:bg-primary/30 transition-colors" title="Add Memory">
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            {/* Filter Controls */}
            <div className="absolute top-4 right-4 z-20 flex gap-2">
                <button
                    onClick={() => toggleTier(1)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-md border transition-all ${activeTiers.includes(1) ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-white/10 text-muted-foreground'}`}
                >
                    Context
                </button>
                <button
                    onClick={() => toggleTier(2)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-md border transition-all ${activeTiers.includes(2) ? 'bg-nexus-tool/20 border-nexus-tool text-nexus-tool' : 'bg-white/5 border-white/10 text-muted-foreground'}`}
                >
                    Short-Term
                </button>
                <button
                    onClick={() => toggleTier(3)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-md border transition-all ${activeTiers.includes(3) ? 'bg-nexus-memory/20 border-nexus-memory text-nexus-memory' : 'bg-white/5 border-white/10 text-muted-foreground'}`}
                >
                    Long-Term
                </button>
            </div>

            {/* Canvas */}
            <div
                className="flex-1 relative cursor-crosshair"
                ref={canvasRef}
                onMouseDown={(e) => handleMouseDown(e)}
                onWheel={(e) => setTransform(t => ({ ...t, k: Math.max(0.2, Math.min(4, t.k - e.deltaY * 0.001)) }))}
            >
                <div
                    className="absolute inset-0 w-full h-full"
                    style={{
                        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
                        transformOrigin: '0 0'
                    }}
                >
                    {/* Links (Constellation Lines) */}
                    <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none opacity-40">
                        {links.map((link, i) => {
                            const start = nodes.find(n => n.id === link.from);
                            const end = nodes.find(n => n.id === link.to);
                            if (!start || !end || !isVisible(start.id) || !isVisible(end.id)) return null;

                            return (
                                <line
                                    key={i}
                                    x1={`${start.x}%`} y1={`${start.y}%`}
                                    x2={`${end.x}%`} y2={`${end.y}%`}
                                    stroke="white"
                                    strokeWidth="0.5"
                                    strokeDasharray="4 4"
                                    className="opacity-30"
                                />
                            );
                        })}
                    </svg>

                    {/* Nodes (Stars) */}
                    {nodes.map((node) => {
                        if (!isVisible(node.id)) return null;
                        const isSelected = selectedNode?.id === node.id;
                        const isHovered = hoveredNode === node.id;

                        return (
                            <div
                                key={node.id}
                                className={`absolute transform -translate-x-1/2 -translate-y-1/2 group`}
                                style={{ left: `${node.x}%`, top: `${node.y}%` }}
                                onMouseDown={(e) => handleMouseDown(e, node.id)}
                                onMouseEnter={() => setHoveredNode(node.id)}
                                onMouseLeave={() => setHoveredNode(null)}
                            >
                                {/* Star Glow */}
                                <div className={`
                                w-3 h-3 rounded-full bg-white transition-all duration-300
                                ${getNodeColor(node.type)}
                                ${isSelected ? 'scale-150' : 'scale-100'}
                                ${isHovered ? 'scale-125' : ''}
                            `} />

                                {/* Star Halo */}
                                <div className={`absolute inset-0 rounded-full animate-pulse opacity-50 blur-sm 
                                ${getNodeColor(node.type)}
                            `} />

                                {/* Label (Visible on Hover/Select) */}
                                <div className={`
                                absolute top-5 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded bg-black/50 border border-white/10 text-[10px] text-white backdrop-blur-sm pointer-events-none transition-opacity
                                ${isHovered || isSelected ? 'opacity-100' : 'opacity-0'}
                            `}>
                                    {node.label}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Info Panel */}
            <AnimatePresence>
                {selectedNode && (
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 20, opacity: 0 }}
                        className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-64 bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 z-30"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-white text-sm">{selectedNode.label}</h3>
                            <div className="flex gap-2">
                                {selectedNode.dbId && (
                                    <button onClick={handleDeleteMemory} className="text-red-400 hover:text-red-300 transition-colors" title="Delete Memory">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                <button onClick={() => setSelectedNode(null)}><X className="w-3 h-3 text-white/50" /></button>
                            </div>
                        </div>
                        <p className="text-[11px] text-white/60 leading-relaxed mb-3">{selectedNode.description}</p>
                        <div className="flex gap-2 text-[9px] uppercase tracking-wider font-mono text-white/40">
                            <span>{selectedNode.type}</span>
                            <span>•</span>
                            <span>Tier {selectedNode.tier}</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Add Memory Modal */}
            <AnimatePresence>
                {showAddModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            className="w-96 bg-[#1a1a1a] border border-white/10 rounded-xl p-6 shadow-2xl"
                        >
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <Brain className="w-5 h-5 text-primary" />
                                New Memory
                            </h3>
                            <textarea
                                autoFocus
                                value={newMemoryContent}
                                onChange={(e) => setNewMemoryContent(e.target.value)}
                                placeholder="Enter observation or fact..."
                                className="w-full h-32 bg-[#0a0a0a] border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-primary resize-none mb-4"
                            />
                            <div className="flex gap-2 mb-6">
                                <button
                                    onClick={() => setNewMemoryTier("short_term")}
                                    className={`flex-1 py-2 rounded-lg text-xs font-medium border ${newMemoryTier === "short_term" ? "bg-primary/20 border-primary text-primary" : "bg-[#2a2a2a] border-transparent text-gray-400"}`}
                                >
                                    Short Term
                                </button>
                                <button
                                    onClick={() => setNewMemoryTier("long_term")}
                                    className={`flex-1 py-2 rounded-lg text-xs font-medium border ${newMemoryTier === "long_term" ? "bg-purple-500/20 border-purple-500 text-purple-400" : "bg-[#2a2a2a] border-transparent text-gray-400"}`}
                                >
                                    Long Term
                                </button>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
                                <button onClick={handleAddMemory} className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors flex items-center gap-2">
                                    <Save className="w-4 h-4" /> Save
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}