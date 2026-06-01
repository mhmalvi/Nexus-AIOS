import React, { useState, useRef } from "react";
import { Layers, Zap, Brain, X, Trash2, Link as LinkIcon, Settings, MessageSquare, Terminal, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface AgentConfig {
    id: string;
    name: string;
    avatar: string;
    description: string;
    model: string;
    provider: string;
    toolPolicy: string;
    persona: string;
    memoryScope: string;
    status: string;
    triggers: string[];
    channels: string[];
    createdAt: string;
    sessionsCount: number;
    tokensUsed: number;
}

export interface Connection {
    id: string;
    source: string;
    target: string;
    type: 'trigger' | 'data';
}

interface AgentCanvasProps {
    agents: AgentConfig[];
    connections: Connection[];
    onConnectionsChange: (conns: Connection[]) => void;
    nodePositions: Record<string, { x: number; y: number }>;
    onNodePositionsChange: (pos: Record<string, { x: number; y: number }>) => void;
}

export function AgentCanvas({ agents, connections, onConnectionsChange, nodePositions, onNodePositionsChange }: AgentCanvasProps) {
    const [selectedNode, setSelectedNode] = useState<string | null>(null);
    const [draggingConnection, setDraggingConnection] = useState<{ source: string; mousePos: { x: number; y: number } } | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    const handleDragEnd = (id: string, info: any) => {
        onNodePositionsChange({
            ...nodePositions,
            [id]: { x: nodePositions[id].x + info.offset.x, y: nodePositions[id].y + info.offset.y }
        });
    };

    const handleConnectStart = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
            setDraggingConnection({
                source: id,
                mousePos: { x: e.clientX - rect.left, y: e.clientY - rect.top }
            });
        }
    };

    const handleConnectEnd = (e: React.MouseEvent, targetId: string) => {
        e.stopPropagation();
        if (draggingConnection && draggingConnection.source !== targetId) {
            const newConn: Connection = {
                id: `conn_${Date.now()}`,
                source: draggingConnection.source,
                target: targetId,
                type: 'trigger'
            };
            // Prevent duplicates
            if (!connections.find(c => c.source === newConn.source && c.target === newConn.target)) {
                onConnectionsChange([...connections, newConn]);
            }
        }
        setDraggingConnection(null);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (draggingConnection && canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            setDraggingConnection(prev => prev ? {
                ...prev,
                mousePos: { x: e.clientX - rect.left, y: e.clientY - rect.top }
            } : null);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'running': return 'bg-emerald-500';
            case 'idle': return 'bg-zinc-500';
            case 'error': return 'bg-red-500';
            default: return 'bg-zinc-600';
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full flex flex-col"
        >
            <div className="p-4 border-b border-border/30 flex justify-between items-center bg-background/50 backdrop-blur-sm z-10">
                <div>
                    <h2 className="text-sm font-semibold flex items-center gap-2">
                        <Layers className="w-4 h-4 text-primary" />
                        Orchestration Canvas
                    </h2>
                    <p className="text-[10px] text-muted-foreground mt-1">
                        Drag to move. Drag from output to input to connect.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => onConnectionsChange([])}
                        className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground transition-colors"
                        title="Clear Connections"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => {
                            const pos: Record<string, { x: number; y: number }> = {};
                            agents.forEach((agent, i) => {
                                pos[agent.id] = { x: 100 + (i % 3) * 250, y: 100 + Math.floor(i / 3) * 180 };
                            });
                            onNodePositionsChange(pos);
                        }}
                        className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground transition-colors"
                        title="Reset Layout"
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div
                ref={canvasRef}
                className="flex-1 relative bg-[radial-gradient(circle_at_center,rgba(var(--primary),0.03)_0%,transparent_70%)] overflow-hidden cursor-crosshair"
                onMouseMove={handleMouseMove}
                onClick={() => setSelectedNode(null)}
            >
                {/* Grid Background */}
                <div className="absolute inset-0 opacity-5 pointer-events-none" style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                }} />

                {/* Connections SVG Layer */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                    <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" opacity="0.5" />
                        </marker>
                    </defs>

                    {/* Existing Connections */}
                    {connections.map(conn => {
                        const sourcePos = nodePositions[conn.source];
                        const targetPos = nodePositions[conn.target];
                        if (!sourcePos || !targetPos) return null;

                        // Offset to center of node roughly (assuming 200x80 node)
                        const sx = sourcePos.x + 180; // Right side
                        const sy = sourcePos.y + 40;  // Middle
                        const tx = targetPos.x + 20;  // Left side
                        const ty = targetPos.y + 40;  // Middle

                        return (
                            <motion.path
                                key={conn.id}
                                d={`M ${sx} ${sy} C ${sx + 50} ${sy}, ${tx - 50} ${ty}, ${tx} ${ty}`}
                                stroke="#64748b"
                                strokeWidth="2"
                                strokeOpacity="0.5"
                                fill="none"
                                markerEnd="url(#arrowhead)"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                            />
                        );
                    })}

                    {/* Dragging Connection Line */}
                    {draggingConnection && nodePositions[draggingConnection.source] && (
                        <path
                            d={`M ${nodePositions[draggingConnection.source].x + 180} ${nodePositions[draggingConnection.source].y + 40} 
                               C ${nodePositions[draggingConnection.source].x + 230} ${nodePositions[draggingConnection.source].y + 40}, 
                                 ${draggingConnection.mousePos.x - 50} ${draggingConnection.mousePos.y}, 
                                 ${draggingConnection.mousePos.x} ${draggingConnection.mousePos.y}`}
                            stroke="#3b82f6"
                            strokeWidth="2"
                            strokeDasharray="5,5"
                            fill="none"
                        />
                    )}
                </svg>

                {/* Nodes */}
                {agents.map(agent => (
                    <motion.div
                        key={agent.id}
                        drag
                        dragMomentum={false}
                        onDragEnd={(_, info) => handleDragEnd(agent.id, info)}
                        initial={{ x: nodePositions[agent.id]?.x || 100, y: nodePositions[agent.id]?.y || 100 }}
                        animate={{ x: nodePositions[agent.id]?.x, y: nodePositions[agent.id]?.y }}
                        onClick={(e) => { e.stopPropagation(); setSelectedNode(agent.id); }}
                        className={`absolute w-[200px] bg-background/90 backdrop-blur-xl border rounded-xl p-3 shadow-xl transition-colors
                            ${selectedNode === agent.id ? 'border-primary ring-1 ring-primary/50' : 'border-border/40 hover:border-primary/40'}`}
                    >
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl">{agent.avatar}</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold truncate">{agent.name}</p>
                                <p className="text-[9px] text-muted-foreground truncate">{agent.model}</p>
                            </div>
                            <div className={`w-2 h-2 rounded-full ${getStatusColor(agent.status)} shadow-[0_0_8px_rgba(0,0,0,0.5)]`} />
                        </div>

                        {/* Quick Stats */}
                        <div className="grid grid-cols-2 gap-1 mb-3">
                            <div className="bg-white/5 rounded px-1.5 py-1 flex items-center gap-1.5">
                                <Zap className="w-3 h-3 text-yellow-500" />
                                <span className="text-[9px] font-mono opacity-80">{agent.tokensUsed > 1000 ? (agent.tokensUsed / 1000).toFixed(1) + 'k' : agent.tokensUsed}</span>
                            </div>
                            <div className="bg-white/5 rounded px-1.5 py-1 flex items-center gap-1.5">
                                <MessageSquare className="w-3 h-3 text-blue-500" />
                                <span className="text-[9px] font-mono opacity-80">{agent.sessionsCount}</span>
                            </div>
                        </div>

                        {/* Ports */}
                        <div className="flex justify-between items-center mt-1">
                            {/* Input Port */}
                            <div
                                className="flex items-center gap-1 group cursor-pointer"
                                onMouseUp={(e) => handleConnectEnd(e, agent.id)}
                            >
                                <div className="w-3 h-3 rounded-full border-2 border-cyan-500/50 bg-background group-hover:bg-cyan-500 transition-colors" />
                                <span className="text-[8px] uppercase tracking-wider text-muted-foreground">In</span>
                            </div>

                            {/* Output Port */}
                            <div
                                className="flex items-center gap-1 group cursor-pointer"
                                onMouseDown={(e) => handleConnectStart(e, agent.id)}
                            >
                                <span className="text-[8px] uppercase tracking-wider text-muted-foreground">Out</span>
                                <div className="w-3 h-3 rounded-full border-2 border-emerald-500/50 bg-background group-hover:bg-emerald-500 transition-colors" />
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Selected Node Details Overlay */}
            <AnimatePresence>
                {selectedNode && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="absolute right-4 top-16 bottom-4 w-64 bg-background/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl p-4 overflow-y-auto z-20"
                    >
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Properties</h3>
                            <button onClick={() => setSelectedNode(null)} className="hover:bg-white/10 p-1 rounded">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {(() => {
                            const agent = agents.find(a => a.id === selectedNode);
                            if (!agent) return null;
                            return (
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-muted-foreground block">Name</label>
                                        <input
                                            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary/50"
                                            value={agent.name}
                                            readOnly
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-muted-foreground block">Model</label>
                                        <div className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs font-mono text-muted-foreground">
                                            {agent.model}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-muted-foreground block">Incoming Connections</label>
                                        <div className="bg-white/5 rounded-lg p-2 space-y-1">
                                            {connections.filter(c => c.target === agent.id).length === 0 ? (
                                                <span className="text-[10px] text-muted-foreground italic">None</span>
                                            ) : (
                                                connections.filter(c => c.target === agent.id).map(c => {
                                                    const source = agents.find(a => a.id === c.source);
                                                    return (
                                                        <div key={c.id} className="flex items-center gap-2 text-[10px] bg-white/5 p-1 rounded">
                                                            <LinkIcon className="w-3 h-3" />
                                                            <span className="truncate">{source?.name || 'Unknown'}</span>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                    <div className="pt-2 border-t border-white/10">
                                        <button className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2">
                                            <Trash2 className="w-3 h-3" /> Remove from Board
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
