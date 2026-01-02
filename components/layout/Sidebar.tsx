
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
            ? 'w-16 bg-card/40 border border-border rounded-2xl backdrop-blur-xl shadow-2xl items-center py-6 gap-6' 
            : 'w-64 bg-card/60 border border-border rounded-2xl backdrop-blur-xl shadow-2xl py-4'
        }
      `}
    >
      {/* Toggle Button (Absolute for aesthetics) */}
      <button 
          onClick={onToggleCollapse}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-card border border-border rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:scale-110 transition-all shadow-lg z-50"
      >
          {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {!isCollapsed && (
        <div className="px-6 mb-4">
          <div className="font-light text-xl tracking-widest text-foreground/90">
            NEXUS <span className="font-bold text-blue-500">OS</span>
          </div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-[0.2em] mt-1">Quantum Kernel 2.4</div>
        </div>
      )}

      <div className={`flex flex-col gap-2 ${isCollapsed ? 'w-full px-0' : 'px-3'}`}>
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`
                group relative flex items-center transition-all duration-300
                ${isCollapsed ? 'justify-center w-10 h-10 mx-auto rounded-xl hover:bg-muted/50' : 'w-full px-4 py-3 rounded-xl hover:bg-muted/50'}
                ${activeView === item.id ? (isCollapsed ? 'bg-blue-500/20 text-blue-500 shadow-sm' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20') : 'text-muted-foreground hover:text-foreground'}
            `}
          >
            <item.icon className={`transition-transform duration-300 ${activeView === item.id ? 'scale-110' : 'group-hover:scale-110'} ${isCollapsed ? 'w-5 h-5' : 'w-4 h-4'}`} />
            
            {!isCollapsed && <span className="ml-3 text-sm font-medium">{item.label}</span>}
            
            {/* Active Indicator Line */}
            {activeView === item.id && !isCollapsed && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-500 rounded-r-full shadow-sm" />
            )}

            {/* Hover Tooltip for collapsed mode */}
            {isCollapsed && (
                <div className="absolute left-full ml-4 px-3 py-1.5 bg-popover border border-border rounded-md text-xs text-popover-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none backdrop-blur-md shadow-xl z-50 translate-x-2 group-hover:translate-x-0">
                    {item.label}
                </div>
            )}
          </button>
        ))}
      </div>

      <div className={`mt-auto ${isCollapsed ? 'px-2' : 'px-4'}`}>
         <div className={`rounded-xl bg-muted/20 border border-border p-3 flex flex-col items-center gap-2 ${isCollapsed ? 'bg-transparent border-none' : ''}`}>
             <Activity className={`w-4 h-4 ${isCollapsed ? 'text-green-500' : 'text-muted-foreground'}`} />
             {!isCollapsed && (
                 <div className="w-full space-y-2">
                     <div className="flex justify-between text-[10px] text-muted-foreground">
                         <span>CPU</span>
                         <span>32%</span>
                     </div>
                     <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                         <div className="h-full bg-green-500 w-[32%]" />
                     </div>
                 </div>
             )}
         </div>
      </div>
    </div>
  );
}
