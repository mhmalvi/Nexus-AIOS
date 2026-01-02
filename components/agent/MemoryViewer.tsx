
import React from "react";
import { Brain, Share2, FileText, Link2, Database } from "lucide-react";

export function MemoryViewer() {
  // Simulated nodes for spatial graph
  const nodes = [
    { id: 1, label: "Current Task", type: 'core', x: 50, y: 50 },
    { id: 2, label: "File System", type: 'tool', x: 30, y: 30 },
    { id: 3, label: "User Prefs", type: 'memory', x: 70, y: 30 },
    { id: 4, label: "/root/logs", type: 'data', x: 20, y: 60 },
    { id: 5, label: "History", type: 'memory', x: 80, y: 70 },
    { id: 6, label: "Python", type: 'tool', x: 40, y: 80 },
  ];

  const connections = [
    { from: 1, to: 2 }, { from: 1, to: 3 }, { from: 1, to: 6 },
    { from: 2, to: 4 }, { from: 3, to: 5 }
  ];

  return (
    <div className="h-full flex flex-col bg-background/50 relative overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b z-10 bg-background/80 backdrop-blur-md flex justify-between items-center">
            <div>
                <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <Share2 className="w-6 h-6 text-primary" />
                    Knowledge Graph
                </h2>
                <p className="text-muted-foreground">Spatial visualization of active semantic context.</p>
            </div>
            <div className="flex gap-2">
                 <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-500 text-xs border border-blue-500/20">Tools</span>
                 <span className="px-2 py-1 rounded bg-purple-500/10 text-purple-500 text-xs border border-purple-500/20">Memory</span>
                 <span className="px-2 py-1 rounded bg-white/10 text-foreground text-xs border border-white/20">Data</span>
            </div>
        </div>

        {/* Graph Canvas */}
        <div className="flex-1 relative bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900 via-background to-background">
            
            {/* Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

            <div className="absolute inset-0 p-10">
                {/* Render Connections */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    {connections.map((link, i) => {
                        const start = nodes.find(n => n.id === link.from);
                        const end = nodes.find(n => n.id === link.to);
                        if (!start || !end) return null;
                        return (
                            <line 
                                key={i}
                                x1={`${start.x}%`} y1={`${start.y}%`}
                                x2={`${end.x}%`} y2={`${end.y}%`}
                                stroke="currentColor"
                                strokeWidth="1"
                                className="text-border opacity-30 animate-pulse"
                            />
                        );
                    })}
                </svg>

                {/* Render Nodes */}
                {nodes.map((node) => (
                    <div 
                        key={node.id}
                        className="absolute transform -translate-x-1/2 -translate-y-1/2 group cursor-pointer transition-all duration-500 hover:scale-110"
                        style={{ left: `${node.x}%`, top: `${node.y}%` }}
                    >
                        {/* Pulse effect for Core */}
                        {node.type === 'core' && (
                            <div className="absolute inset-0 bg-primary/30 rounded-full blur-xl animate-pulse" />
                        )}

                        <div className={`
                            relative flex flex-col items-center justify-center w-16 h-16 rounded-full border bg-background/80 backdrop-blur-sm shadow-xl transition-colors
                            ${node.type === 'core' ? 'border-primary text-primary w-24 h-24 z-10' : ''}
                            ${node.type === 'tool' ? 'border-blue-500/50 text-blue-500' : ''}
                            ${node.type === 'memory' ? 'border-purple-500/50 text-purple-500' : ''}
                            ${node.type === 'data' ? 'border-zinc-500/50 text-zinc-400' : ''}
                        `}>
                            {node.type === 'core' ? <Brain className="w-8 h-8" /> : 
                             node.type === 'tool' ? <Link2 className="w-5 h-5" /> :
                             node.type === 'memory' ? <Database className="w-5 h-5" /> :
                             <FileText className="w-5 h-5" />}
                             
                             {/* Label on Hover */}
                             <div className="absolute -bottom-8 px-2 py-1 bg-black text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                 {node.label}
                             </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    </div>
  );
}
