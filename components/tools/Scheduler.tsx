
import React from 'react';
import { Calendar, Clock, CheckCircle2, Circle, AlertCircle, MoreHorizontal, Plus } from 'lucide-react';
import { useStore } from '../../context/StoreContext';

const tasks = [
    { id: 1, title: "System Audit", time: "09:00 AM", agent: "SecOps", status: "completed", type: "system" },
    { id: 2, title: "Vector Indexing", time: "10:30 AM", agent: "Analyst", status: "in-progress", type: "data" },
    { id: 3, title: "Kernel Patch", time: "02:00 PM", agent: "DevArch", status: "pending", type: "maintenance" },
    { id: 4, title: "Log Rotation", time: "04:00 PM", agent: "Manager", status: "pending", type: "system" },
    { id: 5, title: "Neural Retraining", time: "11:00 PM", agent: "Analyst", status: "scheduled", type: "data" },
];

export function Scheduler() {
  const { ui } = useStore();

  const getStatusColor = (status: string) => {
      switch(status) {
          case 'completed': return 'text-green-500 bg-green-500/10 border-green-500/20';
          case 'in-progress': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
          case 'pending': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
          default: return 'text-muted-foreground bg-muted/10 border-border';
      }
  };

  const getTypeColor = (type: string) => {
      switch(type) {
          case 'system': return 'bg-red-500';
          case 'data': return 'bg-purple-500';
          case 'maintenance': return 'bg-yellow-500';
          default: return 'bg-gray-500';
      }
  };

  return (
    <div className="flex h-full bg-background/50 font-sans">
        {/* Calendar Sidebar */}
        <div className="w-64 border-r border-border/50 bg-muted/10 p-4 flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Schedule</h2>
                <button className="p-1 hover:bg-muted rounded"><Plus className="w-4 h-4" /></button>
            </div>
            
            {/* Mini Calendar Mockup */}
            <div className="bg-card/50 rounded-xl border border-border/50 p-4 shadow-sm">
                <div className="text-center font-bold text-sm mb-4">May 2024</div>
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground mb-2">
                    <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-xs">
                    {Array.from({length: 31}, (_, i) => i + 1).map(d => (
                        <div key={d} className={`p-1.5 rounded-lg cursor-pointer hover:bg-muted ${d === 15 ? 'bg-primary text-primary-foreground font-bold shadow-md' : ''}`}>
                            {d}
                        </div>
                    ))}
                </div>
            </div>

            {/* Upcoming */}
            <div className="space-y-3">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Up Next</h3>
                <div className="p-3 rounded-lg bg-card/30 border border-border/30 flex gap-3 items-center">
                    <div className="flex flex-col items-center bg-muted/50 rounded p-1.5 min-w-[40px]">
                        <span className="text-[10px] font-bold">MAY</span>
                        <span className="text-lg font-bold">16</span>
                    </div>
                    <div>
                        <div className="text-sm font-medium">Weekly Backup</div>
                        <div className="text-xs text-muted-foreground">03:00 AM • Auto</div>
                    </div>
                </div>
            </div>
        </div>

        {/* Timeline View */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background/30">
            <div className="h-14 border-b border-border/50 flex items-center justify-between px-6 bg-card/10 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-light">Today</h2>
                    <span className="text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded-full border border-border/20">5 Tasks</span>
                </div>
                <div className="flex gap-2">
                    <select className="bg-muted/20 border border-border/30 rounded-lg text-xs px-2 py-1.5 outline-none focus:border-primary">
                        <option>All Agents</option>
                        <option>Manager</option>
                        <option>SecOps</option>
                    </select>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Time Indicator Line */}
                <div className="relative">
                    <div className="absolute left-16 top-0 bottom-0 w-px bg-border/30" />
                    
                    {tasks.map((task, i) => (
                        <div key={task.id} className="relative flex gap-6 group mb-6">
                            <div className="w-16 pt-3 text-right text-xs font-mono text-muted-foreground shrink-0">
                                {task.time}
                            </div>
                            
                            {/* Node on Timeline */}
                            <div className={`absolute left-[61px] top-3.5 w-2.5 h-2.5 rounded-full border-2 border-background z-10 ${getTypeColor(task.type)} shadow-sm`} />

                            <div className="flex-1">
                                <div className={`p-4 rounded-xl border transition-all hover:shadow-md hover:scale-[1.01] ${getStatusColor(task.status)} bg-card/60 backdrop-blur-md`}>
                                    <div className="flex justify-between items-start mb-1">
                                        <h4 className="font-bold text-sm text-foreground">{task.title}</h4>
                                        <button className="text-muted-foreground hover:text-foreground"><MoreHorizontal className="w-4 h-4" /></button>
                                    </div>
                                    
                                    <div className="flex items-center justify-between mt-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] bg-background/50 px-2 py-0.5 rounded border border-border/20 font-medium uppercase tracking-wider text-muted-foreground">
                                                {task.agent}
                                            </span>
                                            <span className="text-[10px] opacity-70 capitalize flex items-center gap-1">
                                                {task.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                                                {task.status === 'in-progress' && <Clock className="w-3 h-3 animate-spin-slow" />}
                                                {task.status === 'pending' && <Circle className="w-3 h-3" />}
                                                {task.status}
                                            </span>
                                        </div>
                                        
                                        {task.status === 'in-progress' && (
                                            <div className="w-24 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-500 animate-pulse w-[60%]" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
  );
}
