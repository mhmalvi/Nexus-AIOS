
import React from "react";
import { LayoutDashboard, MessageSquare, Database, Settings, Boxes, ChevronLeft, ChevronRight, Activity, Crosshair } from "lucide-react";
import { Button } from "../ui/Button";

interface SidebarProps {
  activeView: string;
  onViewChange: (view: any) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ activeView, onViewChange, isCollapsed, onToggleCollapse }: SidebarProps) {
  const menuItems = [
    { id: 'chat', icon: MessageSquare, label: 'Communicator' },
    { id: 'war-room', icon: Crosshair, label: 'War Room' },
    { id: 'memory', icon: Database, label: 'Memory Core' },
    { id: 'tools', icon: Boxes, label: 'Agents' },
    { id: 'settings', icon: Settings, label: 'System' },
  ];

  return (
    <div 
      className={`
        relative flex flex-col transition-all duration-500 ease-out z-20
        ${isCollapsed 
            ? 'w-16 bg-zinc-900/40 border border-white/10 rounded-2xl backdrop-blur-xl shadow-2xl items-center py-6 gap-6' 
            : 'w-64 bg-zinc-900/60 border border-white/10 rounded-2xl backdrop-blur-xl shadow-2xl py-4'
        }
      `}
    >
      {/* Toggle Button (Absolute for aesthetics) */}
      <button 
          onClick={onToggleCollapse}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-zinc-800 border border-white/10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:scale-110 transition-all shadow-lg z-50"
      >
          {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {!isCollapsed && (
        <div className="px-6 mb-4">
          <div className="font-light text-xl tracking-widest text-white/90">
            NEXUS <span className="font-bold text-blue-400">OS</span>
          </div>
          <div className="text-[9px] text-white/30 uppercase tracking-[0.2em] mt-1">Quantum Kernel 2.4</div>
        </div>
      )}

      <div className={`flex flex-col gap-2 ${isCollapsed ? 'w-full px-0' : 'px-3'}`}>
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`
                group relative flex items-center transition-all duration-300
                ${isCollapsed ? 'justify-center w-10 h-10 mx-auto rounded-xl hover:bg-white/10' : 'w-full px-4 py-3 rounded-xl hover:bg-white/5'}
                ${activeView === item.id ? (isCollapsed ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'bg-blue-600/10 text-blue-400 border border-blue-500/20') : 'text-zinc-400 hover:text-white'}
            `}
          >
            <item.icon className={`transition-transform duration-300 ${activeView === item.id ? 'scale-110' : 'group-hover:scale-110'} ${isCollapsed ? 'w-5 h-5' : 'w-4 h-4'}`} />
            
            {!isCollapsed && <span className="ml-3 text-sm font-medium">{item.label}</span>}
            
            {/* Active Indicator Line */}
            {activeView === item.id && !isCollapsed && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-500 rounded-r-full shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
            )}

            {/* Hover Tooltip for collapsed mode */}
            {isCollapsed && (
                <div className="absolute left-full ml-4 px-3 py-1.5 bg-zinc-900 border border-white/10 rounded-md text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none backdrop-blur-md shadow-xl z-50 translate-x-2 group-hover:translate-x-0">
                    {item.label}
                </div>
            )}
          </button>
        ))}
      </div>

      <div className={`mt-auto ${isCollapsed ? 'px-2' : 'px-4'}`}>
         <div className={`rounded-xl bg-white/5 border border-white/5 p-3 flex flex-col items-center gap-2 ${isCollapsed ? 'bg-transparent border-none' : ''}`}>
             <Activity className={`w-4 h-4 ${isCollapsed ? 'text-green-500' : 'text-zinc-500'}`} />
             {!isCollapsed && (
                 <div className="w-full space-y-2">
                     <div className="flex justify-between text-[10px] text-zinc-400">
                         <span>CPU</span>
                         <span>32%</span>
                     </div>
                     <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                         <div className="h-full bg-green-500 w-[32%]" />
                     </div>
                 </div>
             )}
         </div>
      </div>
    </div>
  );
}
