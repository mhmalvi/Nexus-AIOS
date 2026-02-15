
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Folder, FileText, Image as ImageIcon, Music, Video, Code, ChevronRight, Home, ArrowLeft, Search, HardDrive, Grid, List, Download, Cloud, Database, MoreVertical, Trash2, Edit2, Eye, RefreshCw, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { motion, AnimatePresence } from 'framer-motion';
import tauriApi from '../../services/tauriApi';

interface FileSystemItem {
    name: string;
    type: 'folder' | 'file';
    fileType?: 'text' | 'image' | 'code' | 'audio' | 'video' | 'system';
    size?: string;
    date: string;
    content?: string; // For mock preview
}

export function FileManager() {
    const { spawnArtifact, setFocusMode, setSelectedAsset, openWindow, addNotification } = useStore();
    const [currentPath, setCurrentPath] = useState('/');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [selectedItem, setSelectedItem] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [fileItems, setFileItems] = useState<FileSystemItem[]>([]);

    const [showCreateModal, setShowCreateModal] = useState<'file' | 'folder' | null>(null);
    const [newItemName, setNewItemName] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [isIndexing, setIsIndexing] = useState(false);

    // Context menu state
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: FileSystemItem } | null>(null);
    const [renameItem, setRenameItem] = useState<FileSystemItem | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [previewItem, setPreviewItem] = useState<FileSystemItem | null>(null);
    const [previewContent, setPreviewContent] = useState('');
    const contextMenuRef = useRef<HTMLDivElement>(null);

    // Helper: Determine file type
    const getFileType = (name: string, isDirectory: boolean): FileSystemItem['fileType'] | undefined => {
        if (isDirectory) return undefined;
        const n = name.toLowerCase();
        if (n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.gif') || n.endsWith('.webp') || n.endsWith('.svg')) return 'image';
        if (n.endsWith('.mp3') || n.endsWith('.wav') || n.endsWith('.ogg')) return 'audio';
        if (n.endsWith('.mp4') || n.endsWith('.webm') || n.endsWith('.mov')) return 'video';
        if (n.endsWith('.ts') || n.endsWith('.tsx') || n.endsWith('.js') || n.endsWith('.jsx') || n.endsWith('.json') ||
            n.endsWith('.css') || n.endsWith('.html') || n.endsWith('.py') || n.endsWith('.rs') || n.endsWith('.md') ||
            n.endsWith('.yml') || n.endsWith('.yaml') || n.endsWith('.toml') || n.endsWith('.txt')) return 'code';
        return 'text';
    };

    const fetchDirectory = async (path: string) => {
        try {
            const entries = await tauriApi.fs.readDir(path);
            const mappedItems: FileSystemItem[] = entries.map(entry => ({
                name: entry.name,
                type: entry.isDirectory ? 'folder' : 'file',
                fileType: getFileType(entry.name, entry.isDirectory),
                size: '--',
                date: new Date().toISOString().split('T')[0],
                content: undefined
            }));

            mappedItems.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'folder' ? -1 : 1;
            });

            setFileItems(mappedItems);
        } catch (err) {
            console.error("Failed to read directory:", err);
            setFileItems([]);
            addNotification({
                title: "Access Denied",
                message: `Could not access ${path}. Check permissions.`,
                type: "error"
            });
        }
    };

    // Fetch files from real FS
    useEffect(() => {
        const init = async () => {
            let pathToRead = currentPath;
            if (currentPath === '/' || currentPath === '') {
                try {
                    const { homeDir } = await import('@tauri-apps/api/path');
                    const home = await homeDir();
                    if (home) {
                        pathToRead = home;
                        setCurrentPath(home);
                    } else {
                        pathToRead = navigator.platform.includes('Win') ? 'C:\\' : '/';
                        setCurrentPath(pathToRead);
                    }
                } catch {
                    pathToRead = navigator.platform.includes('Win') ? 'C:\\' : '/';
                    setCurrentPath(pathToRead);
                }
            }
            if (pathToRead.length > 1 && pathToRead.endsWith(':')) pathToRead += '/';

            await fetchDirectory(pathToRead);
        };
        init();
    }, [currentPath]);

    const refreshFiles = () => fetchDirectory(currentPath);

    const currentItems = useMemo(() => {
        const items = fileItems;
        if (!searchQuery) return items;
        return items.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [fileItems, searchQuery]);

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

    const handleItemDoubleClick = async (item: FileSystemItem) => {
        if (item.type === 'folder') {
            const newPath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
            setCurrentPath(newPath);
            setSelectedItem(null);
        } else if (item.fileType === 'image') {
            // Open in dedicated Image Viewer with REAL URL
            setFocusMode(false);

            const fullPath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
            let assetUrl = '';

            try {
                const { convertFileSrc } = await import('@tauri-apps/api/core');
                assetUrl = convertFileSrc(fullPath);
            } catch (e) {
                console.warn("Could not convert file src, using mock", e);
                assetUrl = 'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=1000&auto=format&fit=crop';
            }

            setSelectedAsset({
                id: `img-${Date.now()}`,
                name: item.name,
                url: assetUrl,
                type: 'image',
                metadata: {
                    size: item.size,
                    type: item.name.split('.').pop()?.toUpperCase() || 'IMG'
                }
            });
            openWindow('media');
        } else if (item.fileType === 'code' || item.fileType === 'text') {
            setFocusMode(false);
            setSelectedAsset({
                id: `file-${Date.now()}`,
                name: item.name,
                url: currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`,
                type: 'code',
                metadata: {
                    size: item.size,
                    language: item.fileType === 'code' ? 'typescript' : 'text'
                }
            });
            openWindow('code');
        } else {
            setFocusMode(false);
            spawnArtifact({
                id: `file-${item.name}-${Date.now()}`,
                title: item.name,
                type: 'preview',
                content: item.content || `Preview not available for: ${item.name}`,
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

    const handleContextMenu = (e: React.MouseEvent, item: FileSystemItem) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, item });
    };

    const handleDelete = async (item: FileSystemItem) => {
        const fullPath = `${currentPath}/${item.name}`;
        try {
            await tauriApi.fs.remove(fullPath);
            addNotification({
                title: 'Deleted',
                message: `${item.name} deleted successfully.`,
                type: 'success'
            });
            await refreshFiles();
        } catch (err) {
            console.error(err);
            addNotification({ title: 'Delete Failed', message: `Could not delete ${item.name}`, type: 'error' });
        }
        setContextMenu(null);
    };

    const handleRename = async () => {
        if (!renameItem || !renameValue) return;
        const oldPath = `${currentPath}/${renameItem.name}`;
        const newPath = `${currentPath}/${renameValue}`;
        try {
            await tauriApi.fs.rename(oldPath, newPath);
            addNotification({ title: 'Renamed', message: `Renamed to ${renameValue}`, type: 'success' });
            await refreshFiles();
        } catch (err) {
            console.error(err);
            addNotification({ title: 'Rename Failed', message: 'Could not rename item.', type: 'error' });
        }
        setRenameItem(null);
        setRenameValue('');
    };

    const handlePreview = async (item: FileSystemItem) => {
        if (item.type === 'folder') return;
        try {
            const content = await tauriApi.fs.readTextFile(`${currentPath}/${item.name}`);
            setPreviewItem(item);
            setPreviewContent(content.substring(0, 2000) + (content.length > 2000 ? '\n...truncated' : ''));
        } catch {
            setPreviewItem(item);
            setPreviewContent('[Binary file - cannot preview]');
        }
        setContextMenu(null);
    };

    const handleDragStart = (e: React.DragEvent, item: FileSystemItem) => {
        e.dataTransfer.setData('text/plain', JSON.stringify(item));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent, targetFolder?: FileSystemItem) => {
        e.preventDefault();
        const data = e.dataTransfer.getData('text/plain');
        if (!data) return;

        try {
            const item = JSON.parse(data) as FileSystemItem;
            if (targetFolder && targetFolder.type === 'folder' && item.name !== targetFolder.name) {
                const oldPath = `${currentPath}/${item.name}`;
                const newPath = `${currentPath}/${targetFolder.name}/${item.name}`;
                await tauriApi.fs.rename(oldPath, newPath);
                addNotification({ title: 'Moved', message: `${item.name} moved to ${targetFolder.name}`, type: 'success' });
                await refreshFiles();
            }
        } catch (err) {
            console.error("Drop failed", err);
        }
    };

    const handleCreateItem = async () => {
        if (!newItemName) return;
        const fullPath = `${currentPath}/${newItemName}`; // TODO: Better path join

        try {
            if (showCreateModal === 'folder') {
                await tauriApi.fs.createDir(fullPath);
            } else {
                // Create empty file
                await tauriApi.fs.writeTextFile(fullPath, '');

                // Index empty file? Maybe wait for content. 
                // Let's index the name at least or a placeholder.
                await tauriApi.memory.store(
                    `File created: ${newItemName} at ${fullPath}`,
                    'short_term',
                    { type: 'file_creation', path: fullPath }
                );
            }
            setShowCreateModal(null);
            setNewItemName('');
            await refreshFiles();
        } catch (err) {
            console.error("Failed to create item:", err);
            addNotification({
                title: "Creation Failed",
                message: "Could not create file or folder.",
                type: "error"
            });
        }
    };

    const handleFileUpload = async () => {
        // Create a hidden file input
        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = async (e: any) => {
            const file = e.target.files[0];
            if (!file) return;

            setIsUploading(true);
            try {
                const text = await file.text();
                const fullPath = `${currentPath}/${file.name}`;

                // Write to disk
                await tauriApi.fs.writeTextFile(fullPath, text);

                // RAG Indexing
                await tauriApi.memory.store(
                    text,
                    'long_term',
                    { type: 'file_upload', path: fullPath, filename: file.name }
                );

                await refreshFiles();
            } catch (err) {
                console.error("Upload failed:", err);
                addNotification({
                    title: "Upload Failed",
                    message: "Could not upload file.",
                    type: "error"
                });
            } finally {
                setIsUploading(false);
            }
        };
        input.click();
    };

    const handleIndexFolder = async () => {
        setIsIndexing(true);
        try {
            await tauriApi.memory.indexDir(currentPath, true); // Recursive by default
            addNotification({
                title: "Indexing Started",
                message: "The kernel is processing this folder for full knowledge access.",
                type: "success"
            });
        } catch (err) {
            console.error("Indexing failed:", err);
            addNotification({
                title: "Indexing Failed",
                message: "Could not start indexing process.",
                type: "error"
            });
        } finally {
            setIsIndexing(false);
        }
    };

    // Close context menu on outside click
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    return (
        <div className="flex h-full bg-background/50 text-foreground font-sans relative">

            {/* Create Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-background border border-border p-6 rounded-xl shadow-xl w-80"
                        >
                            <h3 className="text-lg font-semibold mb-4">Create New {showCreateModal === 'folder' ? 'Folder' : 'File'}</h3>
                            <input
                                autoFocus
                                value={newItemName}
                                onChange={e => setNewItemName(e.target.value)}
                                placeholder={`Enter ${showCreateModal} name...`}
                                className="w-full p-2 bg-muted rounded border border-border mb-4 focus:outline-none focus:border-primary"
                                onKeyDown={e => e.key === 'Enter' && handleCreateItem()}
                            />
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setShowCreateModal(null)} className="px-3 py-1.5 rounded hover:bg-muted transition-colors">Cancel</button>
                                <button onClick={handleCreateItem} className="px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity">Create</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Sidebar - Quick Access */}
            <div className="w-48 border-r border-border/50 bg-muted/10 flex flex-col pt-4 pb-4">
                <div className="px-4 mb-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Locations</div>
                <div className="flex flex-col gap-1 px-2">
                    {(typeof navigator !== 'undefined' && navigator.platform?.startsWith('Win') ? [
                        { name: 'Home', path: 'C:/Users', icon: Home },
                        { name: 'Documents', path: 'C:/Users/Public/Documents', icon: FileText },
                        { name: 'Downloads', path: 'C:/Users/Public/Downloads', icon: Download },
                        { name: 'C: Drive', path: 'C:/', icon: HardDrive },
                        { name: 'D: Drive', path: 'D:/', icon: HardDrive },
                    ] : [
                        { name: 'Home', path: '/home', icon: Home },
                        { name: 'Documents', path: '/home', icon: FileText },
                        { name: 'Downloads', path: '/home', icon: Download },
                        { name: 'Root', path: '/', icon: HardDrive },
                    ]).map((loc) => (
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

                <div className="mt-8 px-4 mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Actions</div>
                <div className="flex flex-col gap-1 px-2">
                    <button onClick={() => setShowCreateModal('file')} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground text-left">
                        <FileText className="w-4 h-4" /> New File
                    </button>
                    <button onClick={() => setShowCreateModal('folder')} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground text-left">
                        <Folder className="w-4 h-4" /> New Folder
                    </button>
                    <button onClick={handleFileUpload} disabled={isUploading} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground text-left">
                        <Cloud className="w-4 h-4" /> {isUploading ? 'Uploading...' : 'Upload File'}
                    </button>
                    <button onClick={handleIndexFolder} disabled={isIndexing} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground text-left">
                        <Database className="w-4 h-4 text-blue-500" /> {isIndexing ? 'Indexing...' : 'Index This Folder'}
                    </button>
                    <button onClick={refreshFiles} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground text-left">
                        <RefreshCw className="w-4 h-4" /> Refresh
                    </button>
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
                                    onContextMenu={(e) => handleContextMenu(e, item)}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, item)}
                                    onDragOver={(e) => item.type === 'folder' ? handleDragOver(e) : undefined}
                                    onDrop={(e) => item.type === 'folder' ? handleDrop(e, item) : undefined}
                                    className={`
                                group flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-all border relative
                                ${selectedItem === item.name
                                            ? 'bg-primary/10 border-primary/50 shadow-[0_0_15px_-5px_rgba(var(--primary),0.3)]'
                                            : 'bg-transparent border-transparent hover:bg-muted/40 hover:border-border/30'
                                        }
                            `}
                                >
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleContextMenu(e, item); }}
                                        className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted"
                                    >
                                        <MoreVertical className="w-3 h-3 text-muted-foreground" />
                                    </button>
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

            {/* Context Menu */}
            <AnimatePresence>
                {contextMenu && (
                    <motion.div
                        ref={contextMenuRef}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="fixed z-50 bg-popover border border-border rounded-lg shadow-xl py-1 min-w-[140px]"
                        style={{ left: contextMenu.x, top: contextMenu.y }}
                        onClick={e => e.stopPropagation()}
                    >
                        <button onClick={() => { handlePreview(contextMenu.item); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left">
                            <Eye className="w-3 h-3" /> Preview
                        </button>
                        <button onClick={() => { setRenameItem(contextMenu.item); setRenameValue(contextMenu.item.name); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left">
                            <Edit2 className="w-3 h-3" /> Rename
                        </button>
                        <button onClick={() => handleDelete(contextMenu.item)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-destructive/10 text-destructive text-left">
                            <Trash2 className="w-3 h-3" /> Delete
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Rename Modal */}
            <AnimatePresence>
                {renameItem && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-background border border-border p-6 rounded-xl shadow-xl w-80">
                            <h3 className="text-lg font-semibold mb-4">Rename {renameItem.type}</h3>
                            <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} className="w-full p-2 bg-muted rounded border border-border mb-4 focus:outline-none focus:border-primary" onKeyDown={e => e.key === 'Enter' && handleRename()} />
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setRenameItem(null)} className="px-3 py-1.5 rounded hover:bg-muted">Cancel</button>
                                <button onClick={handleRename} className="px-3 py-1.5 rounded bg-primary text-primary-foreground">Rename</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Preview Panel */}
            <AnimatePresence>
                {previewItem && (
                    <motion.div
                        initial={{ x: 300, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 300, opacity: 0 }}
                        className="absolute right-0 top-0 bottom-0 w-80 bg-background border-l border-border flex flex-col z-40"
                    >
                        <div className="flex items-center justify-between p-3 border-b border-border">
                            <span className="text-sm font-medium truncate">{previewItem.name}</span>
                            <button onClick={() => setPreviewItem(null)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="flex-1 p-4 overflow-auto">
                            <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">{previewContent}</pre>
                        </div>
                        <div className="p-3 border-t border-border">
                            <button onClick={() => handleItemDoubleClick(previewItem)} className="w-full py-2 bg-primary text-primary-foreground rounded text-sm hover:opacity-90">Open in Editor</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
