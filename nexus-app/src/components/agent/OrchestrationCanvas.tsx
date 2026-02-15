
import React, { useEffect, useState, useRef } from 'react';
import { kernelApi } from '../../services/tauriApi';
import { Brain, Database, Shield, Cpu, Globe, Terminal, Layers, Mic } from 'lucide-react';

interface ComponentNode {
    id: string;
    label: string;
    x: number;
    y: number;
    status: 'active' | 'inactive' | 'error' | 'loading';
    icon: any;
}

interface Connection {
    from: string;
    to: string;
    active: boolean;
}

export function OrchestrationCanvas({ activeComponents = [] }: { activeComponents?: string[] }) {
    const [nodes, setNodes] = useState<ComponentNode[]>([]);

    // Connections are derived from activeComponents
    const connections = nodes.map(node => {
        if (node.id === 'kernel') return null;
        // Check if this component is active
        const isActive = activeComponents.includes(node.id);

        return {
            from: 'kernel',
            to: node.id,
            active: isActive
        };
    }).filter(Boolean) as Connection[];

    const canvasRef = useRef<HTMLDivElement>(null);

    // Initialize layout
    useEffect(() => {
        const cx = 50; // Center X (%)
        const cy = 50; // Center Y (%)
        const radius = 35; // Radius (%)

        const components = [
            { id: 'brain', label: 'Brain / LLM', icon: Brain, angle: 270 },
            { id: 'memory', label: 'Deep Memory', icon: Database, angle: 30 },
            { id: 'security', label: 'Security', icon: Shield, angle: 90 },
            { id: 'browser', label: 'Browser', icon: Globe, angle: 150 },
            { id: 'voice', label: 'Voice', icon: Mic, angle: 210 },
            // { id: 'system', label: 'System IO', icon: Terminal, angle: 300 },
        ];

        const newNodes: ComponentNode[] = [
            { id: 'kernel', label: 'Nexus Kernel', x: cx, y: cy, status: 'active', icon: Cpu },
            ...components.map(c => {
                const angleRad = (c.angle) * (Math.PI / 180);
                return {
                    id: c.id,
                    label: c.label,
                    x: cx + radius * Math.cos(angleRad),
                    y: cy + radius * Math.sin(angleRad),
                    status: 'active' as const, // Default to active layout
                    icon: c.icon
                };
            })
        ];

        setNodes(newNodes);
    }, []);

    return (
        <div ref={canvasRef} className="w-full h-full relative bg-zinc-950/50 overflow-hidden font-mono select-none">
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <defs>
                    <marker id="arrow" markerWidth="10" markerHeight="10" refX="20" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L0,6 L9,3 z" fill="rgba(100, 255, 255, 0.3)" />
                    </marker>
                </defs>
                {connections.map((c, i) => {
                    const fromNode = nodes.find(n => n.id === c.from);
                    const toNode = nodes.find(n => n.id === c.to);
                    if (!fromNode || !toNode) return null;

                    return (
                        <g key={i}>
                            {/* Base connection line */}
                            <line
                                x1={`${fromNode.x}%`} y1={`${fromNode.y}%`}
                                x2={`${toNode.x}%`} y2={`${toNode.y}%`}
                                stroke="rgba(100, 255, 255, 0.1)"
                                strokeWidth="2"
                                strokeDasharray="5,5"
                            />
                            {/* Active Data Flow Animation */}
                            {c.active && (
                                <circle r="3" fill="#22d3ee">
                                    <animateMotion
                                        dur="1s"
                                        repeatCount="indefinite"
                                        path={`M${fromNode.x * 10},${fromNode.y * 10} L${toNode.x * 10},${toNode.y * 10}`} // Scaling issue with % in path, need absolute coords or approximate
                                    />
                                    {/* Simple fallback animation: toggle opacity class is better in React/CSS */}
                                </circle>
                            )}
                            {/* Better active line */}
                            <line
                                x1={`${fromNode.x}%`} y1={`${fromNode.y}%`}
                                x2={`${toNode.x}%`} y2={`${toNode.y}%`}
                                stroke={c.active ? "#22d3ee" : "transparent"}
                                strokeWidth="2"
                                strokeOpacity={c.active ? 0.6 : 0}
                                className="transition-all duration-300"
                            />
                        </g>
                    );
                })}
            </svg>

            {nodes.map(node => (
                <div
                    key={node.id}
                    className={`absolute transform -translate-x-1/2 -translate-y-1/2 p-3 rounded-xl border transition-all duration-300 flex flex-col items-center gap-2 group cursor-pointer
                        ${node.status === 'active'
                            ? 'bg-zinc-900/80 border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.1)] hover:border-cyan-400'
                            : 'bg-zinc-900/40 border-zinc-700/30 opacity-60'}
                    `}
                    style={{ left: `${node.x}%`, top: `${node.y}%` }}
                >
                    <div className={`
                        p-2 rounded-full 
                        ${node.status === 'active' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-zinc-800 text-zinc-500'}
                    `}>
                        <node.icon size={20} />
                    </div>
                    <span className="text-[10px] font-bold text-zinc-300 bg-black/50 px-2 py-0.5 rounded backdrop-blur-sm whitespace-nowrap">
                        {node.label}
                    </span>

                    {/* Status Dot */}
                    <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 
                        ${node.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}
                    `} />
                </div>
            ))}
        </div>
    );
}

// Helper to scale SVG paths if needed (omitted for simplicity, using CSS lines)
