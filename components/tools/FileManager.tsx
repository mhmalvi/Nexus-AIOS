
import React, { useState, useMemo } from 'react';
import { Folder, FileText, Image as ImageIcon, Music, Video, Code, ChevronRight, Home, ArrowLeft, Search, HardDrive, Grid, List, Download, Cloud } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { motion, AnimatePresence } from 'framer-motion';

interface FileSystemItem {
  name: string;
  type: 'folder' | 'file';
  fileType?: 'text' | 'image' | 'code' | 'audio' | 'video' | 'system';
  size?: string;
  date: string;
  content?: string; // For mock preview
}

const mockFileSystem: Record<string, FileSystemItem[]> = {
  '/': [
    { name: 'home', type: 'folder', date: '2024-05-10' },
    { name: 'sys', type: 'folder', date: '2024-01-01' },
    { name: 'mnt', type: 'folder', date: '2024-01-01' },
  ],
  '/home': [
    { name: 'Documents', type: 'folder', date: '2024-05-12' },
    { name: 'Downloads', type: 'folder', date: '2024-05-14' },
    { name: 'Projects', type: 'folder', date: '2024-05-11' },
    { name: 'nexus.config.js', type: 'file', fileType: 'code', size: '2KB', date: '2024-05-01', content: 'export const config = { theme: "dark", modules: ["core", "security"] };' },
    { name: 'README.md', type: 'file', fileType: 'text', size: '4KB', date: '2024-05-01', content: '# Nexus AIOS\n\nWelcome to the future of operating systems.' },
  ],
  '/home/Documents': [
    { name: 'Project_Alpha_Specs.pdf', type: 'file', fileType: 'text', size: '2.4MB', date: '2024-05-12' },
    { name: 'Meeting_Notes.txt', type: 'file', fileType: 'text', size: '12KB', date: '2024-05-13', content: 'Sync with DevArch regarding the new quantum bridge.' },
  ],
  '/home/Downloads': [
    { name: 'installer_v3.dmg', type: 'file', fileType: 'system', size: '140MB', date: '2024-05-14' },
    { name: 'wallpaper_neon.png', type: 'file', fileType: 'image', size: '4MB', date: '2024-05-14' },
  ],
  '/home/Projects': [
    { name: 'nexus-core', type: 'folder', date: '2024-04-20' },
    { name: 'ui-kit', type: 'folder', date: '2024-04-22' },
  ],
  '/sys': [
    { name: 'logs', type: 'folder', date: '2024-05-15' },
    { name: 'kernel.sys', type: 'file', fileType: 'system', size: '500MB', date: '2024-01-01' },
  ],
  '/sys/logs': [
    { name: 'boot.log', type: 'file', fileType: 'text', size: '400KB', date: '2024-05-15', content: 'BOOT_SEQUENCE_INIT... OK\nMOUNT_VFS... OK\nLOAD_NEURAL_ENGINE... OK' },
    { name: 'error.log', type: 'file', fileType: 'text', size: '12KB', date: '2024-05-15', content: 'WARN: High latency on node 4.' },
  ]
};

export function FileManager() {
  const { spawnArtifact, setFocusMode } = useStore();
  const [currentPath, setCurrentPath] = useState('/home');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const currentItems = useMemo(() => {
      const items = mockFileSystem[currentPath] || [];
      if (!searchQuery) return items;
      return items.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [currentPath, searchQuery]);

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    setSelectedItem(null);
  };

  const handleUp = () => {
      if (currentPath === '/') return;
      const parts = currentPath.split('/');
      parts.pop();
      const newPath = parts.join('/') || '/';
      setCurrentPath(newPath);
  };

  const handleItemClick = (item: FileSystemItem) => {
      setSelectedItem(item.name);
  };

  const handleItemDoubleClick = (item: FileSystemItem) => {
      if (item.type === 'folder') {
          const newPath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
          setCurrentPath(newPath);
          setSelectedItem(null);
      } else {
          // Open File Preview
          setFocusMode(false);
          spawnArtifact({
              id: `file-${item.name}-${Date.now()}`,
              title: item.name,
              type: item.fileType === 'code' ? 'code' : 'preview',
              content: item.content || `Preview not available for binary file: ${item.name}`,
              isVisible: true
          });
      }
  };

  const getFileIcon = (item: FileSystemItem) => {
      if (item.type === 'folder') return <Folder className="w-8 h-8 text-blue-500 fill-blue-500/20" />;
      
      switch (item.fileType) {
          case 'image': return <ImageIcon className="w-8 h-8 text-purple-500" />;
          case 'code': return <Code className="w-8 h-8 text-yellow-500" />;
          case 'video': return <Video className="w-8 h-8 text-red-500" />;
          case 'audio': return <Music className="w-8 h-8 text-pink-500" />;
          case 'system': return <HardDrive className="w-8 h-8 text-zinc-500" />;
          default: return <FileText className="w-8 h-8 text-zinc-400" />;
      }
  };

  return (
    <div className="flex h-full bg-background/50 text-foreground font-sans">
      
      {/* Sidebar - Quick Access */}
      <div className="w-48 border-r border-border/50 bg-muted/10 flex flex-col pt-4 pb-4">
          <div className="px-4 mb-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Locations</div>
          <div className="flex flex-col gap-1 px-2">
              {[
                  { name: 'Home', path: '/home', icon: Home },
                  { name: 'Documents', path: '/home/Documents', icon: FileText },
                  { name: 'Downloads', path: '/home/Downloads', icon: Download },
                  { name: 'System', path: '/sys', icon: HardDrive },
                  { name: 'Network', path: '/net', icon: Cloud },
              ].map((loc) => (
                  <button
                    key={loc.name}
                    onClick={() => handleNavigate(loc.path)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors
                        ${currentPath === loc.path ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}
                    `}
                  >
                      <loc.icon className="w-4 h-4" />
                      {loc.name}
                  </button>
              ))}
          </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* Header Bar */}
          <div className="h-12 border-b border-border/50 flex items-center justify-between px-4 bg-background/40 backdrop-blur-md">
              <div className="flex items-center gap-2">
                  <button 
                    onClick={handleUp} 
                    disabled={currentPath === '/'}
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground disabled:opacity-30 transition-colors"
                  >
                      <ArrowLeft className="w-4 h-4" />
                  </button>
                  
                  {/* Breadcrumbs */}
                  <div className="flex items-center text-sm font-medium text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-lg border border-border/30">
                       <span className="text-primary hover:underline cursor-pointer" onClick={() => handleNavigate('/')}>root</span>
                       {currentPath.split('/').filter(Boolean).map((part, i, arr) => {
                           const path = '/' + arr.slice(0, i + 1).join('/');
                           return (
                               <React.Fragment key={path}>
                                   <ChevronRight className="w-3 h-3 mx-1 opacity-50" />
                                   <span 
                                     className={`hover:text-foreground cursor-pointer ${i === arr.length - 1 ? 'text-foreground font-semibold' : ''}`}
                                     onClick={() => handleNavigate(path)}
                                   >
                                       {part}
                                   </span>
                               </React.Fragment>
                           );
                       })}
                  </div>
              </div>

              <div className="flex items-center gap-2">
                  <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search..."
                        className="h-8 pl-8 pr-3 bg-muted/30 border border-border/30 rounded-lg text-xs focus:outline-none focus:border-primary/50 w-40 transition-all focus:w-56"
                      />
                  </div>
                  <div className="h-4 w-px bg-border/40 mx-1" />
                  <div className="flex bg-muted/30 rounded-lg p-0.5 border border-border/30">
                      <button 
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                          <Grid className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                          <List className="w-3.5 h-3.5" />
                      </button>
                  </div>
              </div>
          </div>

          {/* Files Area */}
          <div className="flex-1 overflow-y-auto p-4" onClick={() => setSelectedItem(null)}>
              {currentItems.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3 opacity-60">
                      <Folder className="w-12 h-12 stroke-[1]" />
                      <p className="text-sm">Folder is empty</p>
                  </div>
              ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-4">
                      {currentItems.map((item) => (
                          <div 
                            key={item.name}
                            onClick={(e) => { e.stopPropagation(); handleItemClick(item); }}
                            onDoubleClick={(e) => { e.stopPropagation(); handleItemDoubleClick(item); }}
                            className={`
                                group flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-all border
                                ${selectedItem === item.name 
                                    ? 'bg-primary/10 border-primary/50 shadow-[0_0_15px_-5px_rgba(var(--primary),0.3)]' 
                                    : 'bg-transparent border-transparent hover:bg-muted/40 hover:border-border/30'
                                }
                            `}
                          >
                              <div className="transition-transform group-hover:scale-110 duration-200">
                                  {getFileIcon(item)}
                              </div>
                              <span className="text-[11px] font-medium text-center truncate w-full px-1 select-none">
                                  {item.name}
                              </span>
                          </div>
                      ))}
                  </div>
              ) : (
                  <div className="flex flex-col gap-1">
                      <div className="grid grid-cols-12 px-4 py-2 text-[10px] uppercase tracking-wider font-bold text-muted-foreground border-b border-border/40">
                          <div className="col-span-6">Name</div>
                          <div className="col-span-3">Date Modified</div>
                          <div className="col-span-3">Size</div>
                      </div>
                      {currentItems.map((item) => (
                          <div 
                            key={item.name}
                            onClick={(e) => { e.stopPropagation(); handleItemClick(item); }}
                            onDoubleClick={(e) => { e.stopPropagation(); handleItemDoubleClick(item); }}
                            className={`
                                grid grid-cols-12 px-4 py-2 rounded-lg cursor-pointer items-center text-xs transition-colors border
                                ${selectedItem === item.name 
                                    ? 'bg-primary/10 border-primary/20' 
                                    : 'border-transparent hover:bg-muted/30'
                                }
                            `}
                          >
                              <div className="col-span-6 flex items-center gap-3">
                                  <div className="scale-75">{getFileIcon(item)}</div>
                                  <span className="font-medium">{item.name}</span>
                              </div>
                              <div className="col-span-3 text-muted-foreground">{item.date}</div>
                              <div className="col-span-3 text-muted-foreground font-mono">{item.size || '--'}</div>
                          </div>
                      ))}
                  </div>
              )}
          </div>
          
          {/* Footer Status */}
          <div className="h-8 border-t border-border/40 bg-muted/10 flex items-center px-4 text-[10px] text-muted-foreground gap-4">
              <span>{currentItems.length} items</span>
              <div className="w-px h-3 bg-border/40" />
              <span>{currentItems.reduce((acc, item) => acc + (parseInt(item.size || '0') || 0), 0)} MB Used</span>
          </div>

      </div>
    </div>
  );
}
