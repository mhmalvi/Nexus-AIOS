
import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw, Search, Lock, Star, X, Plus } from 'lucide-react';
import { useStore } from '../../context/StoreContext';

export function WebBrowser() {
  const [url, setUrl] = useState('https://nexus.os/welcome');
  const [inputUrl, setInputUrl] = useState('https://nexus.os/welcome');
  const [isLoading, setIsLoading] = useState(false);
  const [tabs, setTabs] = useState([
      { id: 1, title: 'Nexus Welcome', active: true },
      { id: 2, title: 'Documentation', active: false },
  ]);

  const handleNavigate = (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      // Simulate loading
      setTimeout(() => {
          setUrl(inputUrl);
          setIsLoading(false);
      }, 1500);
  };

  const activeTab = tabs.find(t => t.active);

  return (
    <div className="flex flex-col h-full bg-background font-sans">
      
      {/* Tab Bar */}
      <div className="flex items-center pt-2 px-2 gap-2 bg-muted/20 border-b border-border/50 select-none">
          {tabs.map(tab => (
              <div 
                key={tab.id}
                className={`
                    group relative flex items-center gap-2 px-3 py-2 rounded-t-lg text-xs max-w-[160px] min-w-[100px] cursor-default
                    ${tab.active ? 'bg-background text-foreground shadow-sm' : 'bg-transparent text-muted-foreground hover:bg-muted/40'}
                `}
                onClick={() => setTabs(tabs.map(t => ({ ...t, active: t.id === tab.id })))}
              >
                  <span className="truncate flex-1">{tab.title}</span>
                  <button className={`p-0.5 rounded-md hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity ${tab.active ? 'opacity-100' : ''}`}>
                      <X className="w-3 h-3" />
                  </button>
              </div>
          ))}
          <button className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground ml-1">
              <Plus className="w-4 h-4" />
          </button>
      </div>

      {/* Toolbar */}
      <div className="h-10 border-b border-border/50 flex items-center gap-2 px-2 bg-background">
          <div className="flex gap-1">
              <button className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground disabled:opacity-30">
                  <ArrowLeft className="w-4 h-4" />
              </button>
              <button className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground disabled:opacity-30">
                  <ArrowRight className="w-4 h-4" />
              </button>
              <button 
                onClick={() => handleNavigate({ preventDefault: () => {} } as any)}
                className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground"
              >
                  <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
          </div>

          <form onSubmit={handleNavigate} className="flex-1">
            <div className="relative group">
                <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none">
                     <Lock className="w-3 h-3 text-green-500" />
                </div>
                <input 
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    className="w-full h-7 bg-muted/30 hover:bg-muted/50 focus:bg-background border border-transparent focus:border-primary/30 rounded-full pl-7 pr-8 text-xs focus:outline-none transition-all"
                />
                <div className="absolute inset-y-0 right-2 flex items-center">
                    <Star className="w-3.5 h-3.5 text-muted-foreground/50 hover:text-yellow-500 cursor-pointer transition-colors" />
                </div>
            </div>
          </form>

          <div className="flex gap-1">
               {/* Browser tools placeholder */}
          </div>
      </div>

      {/* Viewport */}
      <div className="flex-1 relative bg-white dark:bg-zinc-900 overflow-hidden">
          {isLoading && (
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-muted overflow-hidden z-20">
                  <div className="h-full bg-primary animate-progress origin-left" />
              </div>
          )}

          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-10 text-center">
               <div className="w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mb-4">
                   <Lock className="w-8 h-8 opacity-20" />
               </div>
               <h3 className="text-lg font-light text-foreground mb-2">Nexus Secure Browser</h3>
               <p className="text-sm max-w-md leading-relaxed opacity-70">
                   You are viewing a simulated secure environment. 
                   External content is rendered via the Neural Proxy to prevent cognitive hazards.
               </p>
               <div className="mt-8 p-4 border border-dashed border-border rounded-lg text-xs font-mono opacity-50 select-text">
                   GET {url} HTTP/1.1<br/>
                   Host: nexus.os<br/>
                   User-Agent: Nexus/3.0 (AIOS; NeuralCore)
               </div>
          </div>
      </div>
    </div>
  );
}
