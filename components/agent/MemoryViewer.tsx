
import React, { useRef, useEffect, useState, useMemo } from "react";
import { Brain, Share2, FileText, Link2, Database, Search, ZoomIn, ZoomOut, Move, X, Filter, Cpu, Layers, Activity, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Node {
  id: number;
  label: string;
  tier: 1 | 2 | 3; // 1=Working(Hot), 2=Context(Warm), 3=Archival(Cold)
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

export function MemoryViewer() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  
  // Interaction State
  const [isDragging, setIsDragging] = useState<{ id: number; startX: number; startY: number } | null>(null);
  const [isPanning, setIsPanning] = useState<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTier, setFilterTier] = useState<string>("all");

  // Initial Data
  const [nodes, setNodes] = useState<Node[]>([
    { id: 1, label: "Active Context", tier: 1, type: 'core', description: "Live execution context and immediate working memory.", x: 50, y: 50, vx: 0, vy: 0, connections: 4 },
    { id: 2, label: "Thought Buffer", tier: 1, type: 'memory', description: "Short-term stream of agent reasoning.", x: 55, y: 45, vx: 0, vy: 0, connections: 2 },
    { id: 3, label: "User Profile", tier: 2, type: 'memory', description: "Persistent user preferences and settings.", x: 70, y: 30, vx: 0, vy: 0, connections: 2 },
    { id: 4, label: "Vector Index", tier: 2, type: 'memory', description: "Semantic search embeddings database.", x: 30, y: 70, vx: 0, vy: 0, connections: 3 },
    { id: 5, label: "Session Logs", tier: 2, type: 'data', description: "Rolling 24h activity logs.", x: 80, y: 70, vx: 0, vy: 0, connections: 1 },
    { id: 6, label: "File System", tier: 3, type: 'tool', description: "Direct access to /mnt/data storage.", x: 20, y: 20, vx: 0, vy: 0, connections: 1 },
    { id: 7, label: "Archives", tier: 3, type: 'data', description: "Cold storage and historical backups.", x: 90, y: 10, vx: 0, vy: 0, connections: 1 },
    { id: 8, label: "Docs / Wiki", tier: 3, type: 'memory', description: "Static knowledge base and documentation.", x: 10, y: 90, vx: 0, vy: 0, connections: 1 },
  ]);

  const links: Link[] = [
    { from: 1, to: 2 }, { from: 1, to: 3 }, { from: 1, to: 4 },
    { from: 2, to: 5 }, { from: 3, to: 1 }, { from: 4, to: 8 }, 
    { from: 6, to: 1 }, { from: 7, to: 5 }
  ];

  // Logic: Filtering
  const filteredNodes = useMemo(() => {
    return nodes.filter(n => {
        const matchSearch = n.label.toLowerCase().includes(searchQuery.toLowerCase());
        const matchType = filterType === "all" || n.type === filterType;
        const matchTier = filterTier === "all" || n.tier.toString() === filterTier;
        return matchSearch && matchType && matchTier;
    });
  }, [nodes, searchQuery, filterType, filterTier]);

  const isVisible = (id: number) => filteredNodes.some(n => n.id === id);

  // Logic: Physics Simulation
  useEffect(() => {
    let animationFrameId: number;
    
    const simulate = () => {
      setNodes(prevNodes => {
        const newNodes = prevNodes.map(n => ({ ...n }));
        // Constants
        const repulsion = 2.0;
        const center = { x: 50, y: 50 };
        const tierRadii = { 1: 8, 2: 28, 3: 45 }; 

        for (let i = 0; i < newNodes.length; i++) {
            const node = newNodes[i];
            
            // Skip physics for dragged node (mouse controls it)
            if (isDragging && isDragging.id === node.id) continue;

            // 1. Repulsion (Nodes push each other away)
            for (let j = i + 1; j < newNodes.length; j++) {
                const other = newNodes[j];
                const dx = node.x - other.x;
                const dy = node.y - other.y;
                const dist = Math.sqrt(dx*dx + dy*dy) || 0.1;
                
                // Inverse square law for repulsion
                const force = repulsion / dist;
                const fx = (dx / dist) * force * 0.05;
                const fy = (dy / dist) * force * 0.05;

                node.vx += fx;
                node.vy += fy;
                other.vx -= fx;
                other.vy -= fy;
            }

            // 2. Orbital Gravity (Pull towards tier ring)
            const dx = node.x - center.x;
            const dy = node.y - center.y;
            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
            const targetR = tierRadii[node.tier];
            // Stronger pull if far away, gentler if close
            const pull = (targetR - dist) * 0.015; 
            
            node.vx += (dx / dist) * pull;
            node.vy += (dy / dist) * pull;
            
            // 3. Gentle Rotation (Planetary motion)
            // Tangent vector (-y, x) creates circular motion
            const speed = node.tier === 1 ? 0.02 : node.tier === 2 ? 0.01 : 0.005;
            node.vx += -dy * speed * 0.05;
            node.vy += dx * speed * 0.05;

            // 4. Damping (Friction)
            node.vx *= 0.92;
            node.vy *= 0.92;

            // Apply Velocity
            node.x += node.vx;
            node.y += node.vy;
        }

        return newNodes;
      });
      animationFrameId = requestAnimationFrame(simulate);
    };

    simulate();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isDragging]);

  // Logic: Interaction Handlers
  const handleWheel = (e: React.WheelEvent) => {
    const scaleFactor = 1.05;
    const direction = e.deltaY > 0 ? -1 : 1;
    const newK = Math.min(Math.max(transform.k * (direction > 0 ? scaleFactor : 1/scaleFactor), 0.5), 4);
    setTransform(prev => ({ ...prev, k: newK }));
  };

  const handleMouseDown = (e: React.MouseEvent, nodeId?: number) => {
      e.stopPropagation();
      if (nodeId) {
          // Start Dragging Node
          setIsDragging({ id: nodeId, startX: e.clientX, startY: e.clientY });
          setSelectedNode(nodes.find(n => n.id === nodeId) || null);
      } else {
          // Start Panning Canvas
          setIsPanning({ startX: e.clientX, startY: e.clientY, initialX: transform.x, initialY: transform.y });
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (isDragging) {
          // Calculate delta in percentage relative to viewport and zoom
          // We divide by window dimensions and transform.k to map pixels back to % coordinate space
          const pxToPercentX = (100 / window.innerWidth) / transform.k;
          const pxToPercentY = (100 / window.innerHeight) / transform.k;
          
          const dx = (e.clientX - isDragging.startX) * pxToPercentX;
          const dy = (e.clientY - isDragging.startY) * pxToPercentY;
          
          setNodes(prev => prev.map(n => 
              n.id === isDragging.id 
              ? { ...n, x: n.x + dx, y: n.y + dy, vx: 0, vy: 0 } // Zero velocity while dragging
              : n
          ));
          
          // Update start positions for next frame
          setIsDragging(prev => prev ? { ...prev, startX: e.clientX, startY: e.clientY } : null);

      } else if (isPanning) {
          const dx = e.clientX - isPanning.startX;
          const dy = e.clientY - isPanning.startY;
          setTransform(prev => ({ ...prev, x: isPanning.initialX + dx, y: isPanning.initialY + dy }));
      }
  };

  const handleMouseUp = () => { setIsDragging(null); setIsPanning(null); };

  // Styling Helpers
  const getNodeColor = (type: string, tier: number) => {
      // Base colors
      if (tier === 1) return 'text-primary bg-primary/20 border-primary shadow-[0_0_20px_rgba(var(--primary),0.3)]';
      switch(type) {
          case 'core': return 'text-nexus-brain bg-nexus-brain/10 border-nexus-brain/50';
          case 'tool': return 'text-nexus-tool bg-nexus-tool/10 border-nexus-tool/50';
          case 'memory': return 'text-nexus-memory bg-nexus-memory/10 border-nexus-memory/50';
          default: return 'text-muted-foreground bg-card border-border';
      }
  };

  const getNodeIcon = (type: string) => {
      switch(type) {
          case 'core': return <Cpu />;
          case 'tool': return <Link2 />;
          case 'memory': return <Database />;
          default: return <FileText />;
      }
  };

  return (
    <div 
        className={`h-full flex flex-col bg-background/50 relative overflow-hidden text-foreground select-none ${isDragging || isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
    >
        {/* --- Background Elements --- */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(var(--foreground),0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(var(--foreground),0.03)_1px,transparent_1px)] bg-[size:40px_40px]" 
             style={{ 
                 transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
                 transformOrigin: '0 0' 
             }}
        />

        {/* --- Header / Filter Bar --- */}
        <div className="absolute top-0 left-0 right-0 p-4 z-20 flex justify-between items-start pointer-events-none">
            <div className="pointer-events-auto flex flex-col gap-3">
                <div className="glass-panel p-3 rounded-xl flex items-center gap-3 border border-border shadow-lg">
                    <div className="p-2 bg-nexus-memory/20 rounded-lg">
                         <Share2 className="w-5 h-5 text-nexus-memory" />
                    </div>
                    <div>
                        <h2 className="font-bold tracking-tight text-foreground text-sm">Neural Architecture</h2>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Live Memory Graph</p>
                    </div>
                </div>
                
                {/* Advanced Filters */}
                <div className="glass-panel p-2 rounded-xl border border-border flex gap-2 shadow-lg">
                     <div className="relative group">
                        <select 
                            className="appearance-none bg-muted/50 hover:bg-muted border border-border text-xs rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:ring-1 focus:ring-primary min-w-[100px] cursor-pointer"
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                        >
                            <option value="all">All Types</option>
                            <option value="core">Core</option>
                            <option value="memory">Memory</option>
                            <option value="tool">Tool</option>
                            <option value="data">Data</option>
                        </select>
                        <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
                     </div>

                     <div className="relative group">
                        <select 
                            className="appearance-none bg-muted/50 hover:bg-muted border border-border text-xs rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:ring-1 focus:ring-primary min-w-[100px] cursor-pointer"
                            value={filterTier}
                            onChange={(e) => setFilterTier(e.target.value)}
                        >
                            <option value="all">All Tiers</option>
                            <option value="1">Tier 1 (Hot)</option>
                            <option value="2">Tier 2 (Warm)</option>
                            <option value="3">Tier 3 (Cold)</option>
                        </select>
                         <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
                     </div>
                </div>
            </div>

            <div className="pointer-events-auto flex flex-col gap-2 items-end">
                <div className="glass-panel p-1 rounded-xl flex items-center w-64 border border-border shadow-lg">
                    <Search className="w-4 h-4 ml-2 text-muted-foreground" />
                    <input 
                        className="bg-transparent border-none focus:outline-none text-sm px-2 py-1.5 w-full text-foreground placeholder:text-muted-foreground/70"
                        placeholder="Search nodes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery("")} className="hover:bg-muted/50 rounded-full p-1">
                            <X className="w-3 h-3 text-muted-foreground" />
                        </button>
                    )}
                </div>
                <div className="glass-panel p-1 rounded-xl flex flex-col gap-1 border border-border shadow-lg">
                    <button onClick={() => setTransform(t => ({...t, k: t.k + 0.1}))} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"><ZoomIn className="w-4 h-4" /></button>
                    <button onClick={() => setTransform(t => ({...t, k: t.k - 0.1}))} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"><ZoomOut className="w-4 h-4" /></button>
                    <button onClick={() => setTransform({x:0, y:0, k:1})} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"><Move className="w-4 h-4" /></button>
                </div>
            </div>
        </div>

        {/* --- Main Canvas --- */}
        <div 
            className="flex-1 relative overflow-hidden" 
            ref={canvasRef}
            onWheel={handleWheel}
            onMouseDown={(e) => handleMouseDown(e)}
        >
            <div 
                className="absolute inset-0 w-full h-full"
                style={{ 
                    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
                    transformOrigin: '0 0'
                }}
            >
                {/* Orbital Rings */}
                <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[90vw] h-[90vw] border border-dashed border-muted-foreground/10 rounded-full pointer-events-none" />
                <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[56vw] h-[56vw] border border-dashed border-muted-foreground/15 rounded-full pointer-events-none" />
                <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[16vw] h-[16vw] border border-primary/10 rounded-full bg-primary/5 pointer-events-none blur-3xl" />

                {/* SVG Layer for Links */}
                <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
                    {links.map((link, i) => {
                        const start = nodes.find(n => n.id === link.from);
                        const end = nodes.find(n => n.id === link.to);
                        if (!start || !end || !isVisible(start.id) || !isVisible(end.id)) return null;
                        
                        const isConnectedToHover = hoveredNode === start.id || hoveredNode === end.id;
                        const isConnectedToSelect = selectedNode?.id === start.id || selectedNode?.id === end.id;
                        const active = isConnectedToHover || isConnectedToSelect;

                        return (
                            <g key={i}>
                                {/* Base Line */}
                                <line 
                                    x1={`${start.x}%`} y1={`${start.y}%`}
                                    x2={`${end.x}%`} y2={`${end.y}%`}
                                    stroke={active ? "rgb(var(--primary))" : "var(--border)"}
                                    strokeWidth={active ? 2 : 1}
                                    strokeOpacity={active ? 0.8 : 0.4}
                                    className="transition-all duration-300"
                                />
                                {/* Flowing Data Packet */}
                                <circle r={active ? 3 : 2} fill={active ? "rgb(var(--primary))" : "rgb(var(--muted-foreground))"}>
                                    <animateMotion 
                                        dur={`${3 + (i % 2)}s`} 
                                        repeatCount="indefinite"
                                        path={`M${start.x * (window.innerWidth/100)},${start.y * (window.innerHeight/100)} L${end.x * (window.innerWidth/100)},${end.y * (window.innerHeight/100)}`}
                                    />
                                    <animate attributeName="opacity" values="0;1;0" dur={`${3 + (i % 2)}s`} repeatCount="indefinite" />
                                </circle>
                            </g>
                        );
                    })}
                </svg>

                {/* Nodes Layer */}
                {nodes.map((node) => {
                    if (!isVisible(node.id)) return null;

                    const isSelected = selectedNode?.id === node.id;
                    const isHovered = hoveredNode === node.id;
                    const dim = (hoveredNode && !isHovered) || (selectedNode && !isSelected && !hoveredNode);
                    
                    return (
                        <div 
                            key={node.id}
                            className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300
                                ${dim ? 'opacity-30 scale-90 blur-[1px]' : 'opacity-100 scale-100'}
                                ${isDragging?.id === node.id ? 'z-50 cursor-grabbing' : 'z-10 cursor-pointer'}
                            `}
                            style={{ left: `${node.x}%`, top: `${node.y}%` }}
                            onMouseDown={(e) => handleMouseDown(e, node.id)}
                            onMouseEnter={() => setHoveredNode(node.id)}
                            onMouseLeave={() => setHoveredNode(null)}
                        >
                            {/* Pulse Effect for Core/Selected */}
                            {(node.tier === 1 || isSelected) && (
                                <div className={`absolute inset-0 rounded-full blur-xl animate-pulse-slow scale-150 pointer-events-none 
                                    ${isSelected ? 'bg-primary/40' : 'bg-primary/20'}`} 
                                />
                            )}

                            <div className={`
                                relative flex flex-col items-center justify-center rounded-full border backdrop-blur-xl shadow-lg transition-all duration-300
                                ${getNodeColor(node.type, node.tier)}
                                ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110' : ''}
                                ${isHovered && !isSelected ? 'scale-110 ring-1 ring-primary/50' : ''}
                                ${node.tier === 1 ? 'w-24 h-24' : node.tier === 2 ? 'w-16 h-16' : 'w-12 h-12'}
                            `}>
                                {React.cloneElement(getNodeIcon(node.type) as React.ReactElement<any>, { 
                                    className: `w-1/2 h-1/2 transition-transform duration-500 ${isHovered ? 'scale-110' : ''}` 
                                })}
                                
                                {/* Label Tag */}
                                <div className={`
                                    absolute -bottom-8 whitespace-nowrap px-3 py-1 rounded-full bg-background/90 border border-border text-[10px] font-bold backdrop-blur-md shadow-lg transition-all
                                    ${isSelected ? 'text-primary border-primary scale-110' : 'text-muted-foreground'}
                                `}>
                                    {node.label}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
        
        {/* --- Details Panel (Slide Over) --- */}
        <AnimatePresence>
            {selectedNode && (
                <motion.div 
                    initial={{ x: '100%', opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: '100%', opacity: 0 }}
                    transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    className="absolute top-20 bottom-20 right-4 w-80 glass-panel bg-card/95 backdrop-blur-2xl rounded-2xl border border-border shadow-2xl z-40 flex flex-col overflow-hidden"
                >
                    {/* Panel Header */}
                    <div className="p-5 border-b border-border bg-muted/20 flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div className={`p-3 rounded-xl border shadow-sm ${getNodeColor(selectedNode.type, selectedNode.tier)}`}>
                                {React.cloneElement(getNodeIcon(selectedNode.type) as React.ReactElement<any>, { className: "w-6 h-6" })}
                            </div>
                            <div>
                                <h3 className="font-bold text-foreground text-lg leading-none mb-1">{selectedNode.label}</h3>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-mono uppercase">Tier {selectedNode.tier}</span>
                                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{selectedNode.type}</span>
                                </div>
                            </div>
                        </div>
                        <button onClick={() => setSelectedNode(null)} className="hover:bg-muted/50 p-1.5 rounded-full text-muted-foreground hover:text-foreground transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    
                    {/* Panel Content */}
                    <div className="p-6 space-y-6 overflow-y-auto text-foreground flex-1">
                         <div className="space-y-2">
                             <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">About</label>
                             <p className="text-sm leading-relaxed text-foreground/80">{selectedNode.description}</p>
                         </div>

                         <div className="space-y-2">
                             <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Real-time Metrics</label>
                             <div className="grid grid-cols-2 gap-3">
                                 <div className="p-3 bg-muted/30 rounded-xl border border-border flex flex-col gap-1">
                                     <Activity className="w-4 h-4 text-green-500 mb-1" />
                                     <span className="text-[10px] text-muted-foreground">Velocity</span>
                                     <span className="font-mono text-lg">{(Math.abs(selectedNode.vx) + Math.abs(selectedNode.vy)).toFixed(3)}</span>
                                 </div>
                                 <div className="p-3 bg-muted/30 rounded-xl border border-border flex flex-col gap-1">
                                     <Share2 className="w-4 h-4 text-blue-500 mb-1" />
                                     <span className="text-[10px] text-muted-foreground">Connections</span>
                                     <span className="font-mono text-lg">{selectedNode.connections}</span>
                                 </div>
                             </div>
                         </div>
                         
                         <div className="space-y-2">
                             <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Coordinates</label>
                             <div className="p-3 bg-black/5 dark:bg-black/40 rounded-lg border border-border font-mono text-xs flex justify-between">
                                 <span>X: {selectedNode.x.toFixed(2)}%</span>
                                 <span>Y: {selectedNode.y.toFixed(2)}%</span>
                             </div>
                         </div>
                    </div>
                    
                    {/* Panel Footer */}
                    <div className="p-4 border-t border-border bg-muted/20">
                         <button className="w-full py-2.5 bg-foreground text-background rounded-xl text-sm font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg">
                             <Move className="w-4 h-4" />
                             Center Focus
                         </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    </div>
  );
}
