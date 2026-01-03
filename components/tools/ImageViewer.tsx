
import React, { useState } from 'react';
import { ZoomIn, ZoomOut, Maximize, Share2, Info, X, Image as ImageIcon, File } from 'lucide-react';
import { useStore } from '../../context/StoreContext';

export function ImageViewer() {
  const { selectedAsset } = useStore();
  const [scale, setScale] = useState(1);

  if (!selectedAsset) {
      return (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4 bg-black/90">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 opacity-50" />
              </div>
              <p className="text-sm">No Asset Loaded</p>
          </div>
      );
  }

  return (
    <div className="flex h-full bg-[#050505] text-white overflow-hidden relative">
        
        {/* Toolbar */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl">
            <button onClick={() => setScale(s => Math.max(0.2, s - 0.2))} className="p-2 hover:bg-white/10 rounded-full transition-colors"><ZoomOut className="w-4 h-4" /></button>
            <span className="text-xs font-mono w-12 text-center">{(scale * 100).toFixed(0)}%</span>
            <button onClick={() => setScale(s => Math.min(3, s + 0.2))} className="p-2 hover:bg-white/10 rounded-full transition-colors"><ZoomIn className="w-4 h-4" /></button>
            <div className="w-px h-4 bg-white/20 mx-1" />
            <button className="p-2 hover:bg-white/10 rounded-full transition-colors"><Maximize className="w-4 h-4" /></button>
        </div>

        {/* Main View */}
        <div className="flex-1 overflow-hidden flex items-center justify-center p-8 cursor-grab active:cursor-grabbing">
            {selectedAsset.type === 'image' ? (
                <img 
                    src={selectedAsset.url} 
                    alt={selectedAsset.name} 
                    className="max-w-full max-h-full object-contain transition-transform duration-200 shadow-2xl"
                    style={{ transform: `scale(${scale})` }}
                />
            ) : (
                <div className="flex flex-col items-center gap-4 p-12 border border-white/10 rounded-2xl bg-white/5">
                    <File className="w-16 h-16 text-muted-foreground" />
                    <span className="text-lg font-medium">{selectedAsset.name}</span>
                    <span className="text-sm text-muted-foreground">Preview unavailable for format</span>
                </div>
            )}
        </div>

        {/* Sidebar */}
        <div className="w-64 bg-[#0a0a0a] border-l border-white/5 p-6 flex flex-col gap-6 z-10">
            <div>
                <h3 className="text-sm font-bold mb-1 truncate" title={selectedAsset.name}>{selectedAsset.name}</h3>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{selectedAsset.metadata?.type || 'UNKNOWN'}</p>
            </div>

            <div className="space-y-4">
                <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Dimensions</label>
                    <div className="font-mono text-xs">{selectedAsset.metadata?.width || '--'} x {selectedAsset.metadata?.height || '--'}</div>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Size</label>
                    <div className="font-mono text-xs">{selectedAsset.metadata?.size || '--'}</div>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Created</label>
                    <div className="font-mono text-xs">2024-05-14 14:30:22</div>
                </div>
            </div>

            <div className="mt-auto">
                <button className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2">
                    <Share2 className="w-3.5 h-3.5" />
                    Share Asset
                </button>
            </div>
        </div>
    </div>
  );
}
