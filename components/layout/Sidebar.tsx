import React from "react";
import { MessageSquare, Database, Settings, Layers, ChevronLeft, ChevronRight, Activity, Crosshair, Bot, Users } from "lucide-react";
import { useStore } from "../../context/StoreContext";

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ isCollapsed, onToggleCollapse }: SidebarProps) {
  const { windows, openWindow, focusWindow } = useStore();

  const menuItems = [
    { id: 'chat', icon: MessageSquare, label: 'Communicator' },
    { id: 'war-room', icon: Crosshair, label: 'War Room' },
    { id: 'memory', icon: Database, label: 'Memory Core' },
    { id: 'agents', icon: Users, label: 'Swarm' }, 
    { id: 'settings', icon: Settings, label: 'System' }, 
  ];

  const handleMenuClick = (id: string) => {
    // Force open if closed, otherwise focus
    if (!windows[id]?.isOpen) {
        openWindow(id);
    } else {
        focusWindow(id);
    }
  };

  return (
    <div 
      className={`
        relative flex flex-col transition-all duration-500 ease-out z-20
        ${isCollapsed 
            ? 'w-12 bg-background/60 border border-border rounded-xl backdrop-blur-xl shadow-xl items-center py-4 gap-3' 
            : 'w-56 bg-background/80 border border-border rounded-xl backdrop-blur-xl shadow-xl py-4'
        }
      `}
    >
      <button 
          onClick={onToggleCollapse}
          className="absolute -right-3 top-6 w-6 h-6 bg-card border border-border rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:scale-110 transition-all shadow-md z-50"
      >
          {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      <div className={`flex flex-col gap-1.5 ${isCollapsed ? 'w-full px-0' : 'px-3'}`}>
        {menuItems.map((item) => {
          const isOpen = windows[item.id]?.isOpen;
          return (
            <button
              key={item.id}
              onClick={() => handleMenuClick(item.id)}
              className={`
                  group relative flex items-center transition-all duration-200
                  ${isCollapsed ? 'justify-center w-8 h-8 mx-auto rounded-lg' : 'w-full px-3 py-2 rounded-lg'}
                  ${isOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}
              `}
              title={isCollapsed ? item.label : undefined}
            >
              <item.icon className={`transition-transform duration-300 ${isOpen ? 'scale-100' : 'group-hover:scale-110'} ${isCollapsed ? 'w-5 h-5' : 'w-4 h-4'}`} />
              
              {!isCollapsed && <span className="ml-3 text-xs font-medium">{item.label}</span>}
              
              {isOpen && !isCollapsed && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-r-full shadow-sm" />
              )}
            </button>
          )
        })}
      </div>

      <div className={`mt-auto ${isCollapsed ? 'px-1' : 'px-3'}`}>
         <div className={`rounded-lg bg-card/50 border border-border p-2 flex flex-col items-center gap-2 ${isCollapsed ? 'bg-transparent border-none' : ''}`}>
             <Activity className={`w-4 h-4 ${isCollapsed ? 'text-green-500' : 'text-muted-foreground'}`} />
             {!isCollapsed && (
                 <div className="w-full space-y-1.5">
                     <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                         <span>Load</span>
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
