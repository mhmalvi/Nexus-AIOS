import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ZoomIn, ZoomOut, Maximize, Share2, Info, X, Image as ImageIcon, File, Loader2, FolderOpen, Play, Pause, RotateCcw, RotateCw, Clock, ChevronLeft, ChevronRight, Video, Settings, Film, HardDrive, Calendar } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { fsApi } from '../../services/tauriApi';
import { motion, AnimatePresence } from 'framer-motion';

interface MediaAsset {
    id: string;
    name: string;
    type: 'image' | 'video';
    url: string;
    path: string;
    metadata: {
        type: string;
        size?: string;
        dimensions?: string;
        date?: string;
    };
}

const STORAGE_KEY = 'nexus-imageviewer-settings';

export function ImageViewer() {
    const { selectedAsset, setSelectedAsset, addNotification } = useStore();
    const [scale, setScale] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [galleryAssets, setGalleryAssets] = useState<MediaAsset[]>([]);
    const [loading, setLoading] = useState(false);
    const [scanPath, setScanPath] = useState(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                return JSON.parse(saved).lastPath || 'c:/Users';
            } catch { return 'c:/Users'; }
        }
        return 'c:/Users';
    });
    const [pathInput, setPathInput] = useState(scanPath);
    const [recentPaths, setRecentPaths] = useState<string[]>(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                return JSON.parse(saved).recentPaths || [];
            } catch { return []; }
        }
        return [];
    });

    // Slideshow states
    const [slideshowActive, setSlideshowActive] = useState(false);
    const [slideshowInterval, setSlideshowInterval] = useState(5000);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [showSettings, setShowSettings] = useState(false);

    // Video state
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [videoProgress, setVideoProgress] = useState(0);

    // Save settings to localStorage
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            lastPath: scanPath,
            recentPaths: recentPaths.slice(0, 5)
        }));
    }, [scanPath, recentPaths]);

    useEffect(() => {
        if (!selectedAsset) {
            scanImages();
        }
    }, [selectedAsset]);

    // Slideshow effect
    useEffect(() => {
        if (!slideshowActive || galleryAssets.length === 0) return;

        const timer = setInterval(() => {
            setCurrentIndex(prev => {
                const next = (prev + 1) % galleryAssets.length;
                setSelectedAsset(galleryAssets[next] as any);
                return next;
            });
        }, slideshowInterval);

        return () => clearInterval(timer);
    }, [slideshowActive, slideshowInterval, galleryAssets]);

    // Reset rotation when asset changes
    useEffect(() => {
        setRotation(0);
        setScale(1);
    }, [selectedAsset]);

    const scanImages = async () => {
        setLoading(true);
        try {
            let foundAssets: MediaAsset[] = [];

            try {
                const files = await fsApi.readDir(scanPath);
                if (files) {
                    // Filter for images and videos
                    const mediaFiles = files.filter(f =>
                        /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(f.name) ||
                        /\.(mp4|webm|mov|avi|mkv)$/i.test(f.name)
                    );

                    const assets = mediaFiles.map(f => {
                        const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(f.name);
                        return {
                            id: f.path,
                            name: f.name,
                            type: isVideo ? 'video' as const : 'image' as const,
                            url: fsApi.convertFileSrc(f.path),
                            path: f.path,
                            metadata: {
                                type: f.name.split('.').pop()?.toUpperCase() || 'UNKNOWN',
                                size: 'Local File'
                            }
                        };
                    });
                    foundAssets = [...foundAssets, ...assets];
                }
            } catch (e) {
                console.error('Failed to scan directory:', e);
            }

            setGalleryAssets(foundAssets);

            // Add to recent paths if new
            if (!recentPaths.includes(scanPath)) {
                setRecentPaths(prev => [scanPath, ...prev.slice(0, 4)]);
            }
        } catch (e) {
            console.error("Gallery scan failed", e);
            addNotification({
                type: 'error',
                title: 'Scan Failed',
                message: 'Could not read the specified directory'
            });
        } finally {
            setLoading(false);
        }
    };

    const handlePathSubmit = () => {
        setScanPath(pathInput);
        scanImages();
    };

    const handleNavigate = (direction: 'prev' | 'next') => {
        if (galleryAssets.length === 0) return;

        const currentIdx = galleryAssets.findIndex(a => a.id === selectedAsset?.id);
        let newIndex: number;

        if (direction === 'next') {
            newIndex = (currentIdx + 1) % galleryAssets.length;
        } else {
            newIndex = currentIdx <= 0 ? galleryAssets.length - 1 : currentIdx - 1;
        }

        setCurrentIndex(newIndex);
        setSelectedAsset(galleryAssets[newIndex] as any);
    };

    const handleRotate = (direction: 'left' | 'right') => {
        setRotation(prev => prev + (direction === 'right' ? 90 : -90));
    };

    const toggleSlideshow = () => {
        if (!slideshowActive && galleryAssets.length > 0) {
            // Start slideshow
            if (!selectedAsset && galleryAssets.length > 0) {
                setSelectedAsset(galleryAssets[0] as any);
                setCurrentIndex(0);
            }
        }
        setSlideshowActive(!slideshowActive);
    };

    const handleVideoToggle = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleVideoTimeUpdate = () => {
        if (videoRef.current) {
            const progress = (videoRef.current.currentTime / videoRef.current.duration) * 100;
            setVideoProgress(progress);
        }
    };

    const isVideo = selectedAsset?.type === 'video' || /\.(mp4|webm|mov|avi|mkv)$/i.test(selectedAsset?.name || '');
    const imageCount = galleryAssets.filter(a => a.type === 'image').length;
    const videoCount = galleryAssets.filter(a => a.type === 'video').length;

    if (!selectedAsset) {
        return (
            <div className="h-full bg-[#050505] text-white flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <ImageIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold">Holo-Viewer</h2>
                            <p className="text-[10px] text-muted-foreground">Media Gallery</p>
                        </div>
                    </div>
                    <div className="flex gap-2 text-xs items-center">
                        {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground mr-2" />}
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-primary text-primary-foreground' : 'bg-white/10 hover:bg-white/20'}`}
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                        <button onClick={scanImages} className="px-3 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors flex items-center gap-1">
                            <FolderOpen className="w-3 h-3" /> Rescan
                        </button>
                    </div>
                </div>

                {/* Path Input */}
                <div className="p-4 border-b border-white/10 bg-white/5">
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                value={pathInput}
                                onChange={e => setPathInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handlePathSubmit()}
                                placeholder="Enter folder path..."
                                className="w-full bg-black/30 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary"
                            />
                        </div>
                        <button
                            onClick={handlePathSubmit}
                            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                        >
                            Scan
                        </button>
                    </div>

                    {/* Recent Paths */}
                    {recentPaths.length > 0 && (
                        <div className="mt-2 flex gap-2 flex-wrap">
                            {recentPaths.map((path, i) => (
                                <button
                                    key={i}
                                    onClick={() => {
                                        setPathInput(path);
                                        setScanPath(path);
                                    }}
                                    className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/10 truncate max-w-[200px]"
                                >
                                    {path.split('/').pop() || path}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Settings Panel */}
                <AnimatePresence>
                    {showSettings && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-b border-white/10 overflow-hidden"
                        >
                            <div className="p-4 bg-white/5 space-y-3">
                                <h4 className="text-xs font-bold text-muted-foreground">Slideshow Settings</h4>
                                <div className="flex items-center gap-4">
                                    <label className="text-xs text-muted-foreground">Interval:</label>
                                    <div className="flex gap-2">
                                        {[3000, 5000, 10000].map(ms => (
                                            <button
                                                key={ms}
                                                onClick={() => setSlideshowInterval(ms)}
                                                className={`px-3 py-1 rounded text-xs ${slideshowInterval === ms ? 'bg-primary text-primary-foreground' : 'bg-white/10 hover:bg-white/20'}`}
                                            >
                                                {ms / 1000}s
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Stats Bar */}
                <div className="px-4 py-2 bg-white/5 border-b border-white/10 flex items-center gap-4 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" /> {imageCount} images
                    </span>
                    <span className="flex items-center gap-1">
                        <Film className="w-3 h-3" /> {videoCount} videos
                    </span>
                    <span className="flex items-center gap-1">
                        <HardDrive className="w-3 h-3" /> {scanPath}
                    </span>
                </div>

                {/* Gallery Grid */}
                <div className="flex-1 overflow-y-auto p-4">
                    {galleryAssets.length === 0 && !loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
                            <p>No media found in this folder.</p>
                            <p className="text-xs opacity-50 font-mono mt-1">{scanPath}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {galleryAssets.map((asset, index) => (
                                <motion.div
                                    key={asset.id}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: index * 0.02 }}
                                    onClick={() => {
                                        setSelectedAsset(asset as any);
                                        setCurrentIndex(index);
                                    }}
                                    className="group relative aspect-square bg-white/5 rounded-xl border border-white/10 overflow-hidden cursor-pointer hover:border-primary/50 transition-all"
                                >
                                    {asset.type === 'video' ? (
                                        <div className="w-full h-full flex items-center justify-center bg-black">
                                            <Video className="w-8 h-8 text-muted-foreground" />
                                            <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-red-500 text-white text-[9px] rounded font-bold">
                                                VIDEO
                                            </div>
                                        </div>
                                    ) : (
                                        <img
                                            src={asset.url}
                                            alt={asset.name}
                                            className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                                            loading="lazy"
                                        />
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent translate-y-full group-hover:translate-y-0 transition-transform">
                                        <p className="text-xs font-medium truncate">{asset.name}</p>
                                        <p className="text-[10px] text-muted-foreground">{asset.metadata.type}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Slideshow Controls */}
                {galleryAssets.length > 0 && (
                    <div className="p-3 border-t border-white/10 flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                            {galleryAssets.length} items
                        </div>
                        <button
                            onClick={toggleSlideshow}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${slideshowActive ? 'bg-red-500 text-white' : 'bg-primary text-primary-foreground'}`}
                        >
                            {slideshowActive ? (
                                <><Pause className="w-4 h-4" /> Stop Slideshow</>
                            ) : (
                                <><Play className="w-4 h-4" /> Start Slideshow</>
                            )}
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex h-full bg-[#050505] text-white overflow-hidden relative animate-in fade-in duration-300">
            {/* Toolbar */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl">
                {/* Navigation */}
                <button onClick={() => handleNavigate('prev')} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono px-2">{currentIndex + 1}/{galleryAssets.length}</span>
                <button onClick={() => handleNavigate('next')} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <ChevronRight className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-white/20 mx-1" />

                {/* Zoom controls (for images) */}
                {!isVideo && (
                    <>
                        <button onClick={() => setScale(s => Math.max(0.2, s - 0.2))} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <ZoomOut className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-mono w-12 text-center">{(scale * 100).toFixed(0)}%</span>
                        <button onClick={() => setScale(s => Math.min(3, s + 0.2))} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <ZoomIn className="w-4 h-4" />
                        </button>

                        <div className="w-px h-4 bg-white/20 mx-1" />

                        {/* Rotate */}
                        <button onClick={() => handleRotate('left')} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="Rotate Left">
                            <RotateCcw className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleRotate('right')} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="Rotate Right">
                            <RotateCw className="w-4 h-4" />
                        </button>
                    </>
                )}

                {/* Video controls */}
                {isVideo && (
                    <button onClick={handleVideoToggle} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                )}

                <div className="w-px h-4 bg-white/20 mx-1" />

                {/* Slideshow toggle */}
                <button
                    onClick={toggleSlideshow}
                    className={`p-2 rounded-full transition-colors ${slideshowActive ? 'bg-primary text-primary-foreground' : 'hover:bg-white/10'}`}
                    title={slideshowActive ? 'Stop Slideshow' : 'Start Slideshow'}
                >
                    {slideshowActive ? <Pause className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                </button>

                <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <Maximize className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-white/20 mx-1" />

                <button onClick={() => setSelectedAsset(null)} className="p-2 hover:bg-red-500/20 text-red-500 rounded-full transition-colors">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Main View */}
            <div className="flex-1 overflow-hidden flex items-center justify-center p-8 cursor-grab active:cursor-grabbing">
                {isVideo ? (
                    <div className="relative">
                        <video
                            ref={videoRef}
                            src={selectedAsset.url}
                            className="max-w-full max-h-full shadow-2xl rounded-lg"
                            onTimeUpdate={handleVideoTimeUpdate}
                            onEnded={() => setIsPlaying(false)}
                            controls={false}
                        />
                        {/* Video Progress Bar */}
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                            <div
                                className="h-full bg-primary transition-all"
                                style={{ width: `${videoProgress}%` }}
                            />
                        </div>
                    </div>
                ) : (
                    <img
                        src={selectedAsset.url}
                        alt={selectedAsset.name}
                        className="max-w-full max-h-full object-contain transition-transform duration-200 shadow-2xl"
                        style={{
                            transform: `scale(${scale}) rotate(${rotation}deg)`
                        }}
                    />
                )}
            </div>

            {/* Sidebar */}
            <div className="w-64 bg-[#0a0a0a] border-l border-white/5 p-6 flex flex-col gap-6 z-10 hidden md:flex">
                <div>
                    <h3 className="text-sm font-bold mb-1 truncate" title={selectedAsset.name}>{selectedAsset.name}</h3>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                        {isVideo ? <Video className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                        {selectedAsset.metadata?.type || 'UNKNOWN'}
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="p-3 bg-white/5 rounded-lg text-xs leading-relaxed text-muted-foreground">
                        {isVideo ? 'Video loaded from local filesystem.' : 'Image loaded from local filesystem via secure bridge.'}
                    </div>

                    {/* Metadata */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Type</span>
                            <span className="font-mono">{selectedAsset.metadata?.type}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Index</span>
                            <span className="font-mono">{currentIndex + 1} / {galleryAssets.length}</span>
                        </div>
                        {rotation !== 0 && (
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Rotation</span>
                                <span className="font-mono">{rotation}°</span>
                            </div>
                        )}
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground">Path</label>
                        <div className="font-mono text-[10px] break-all opacity-70 p-2 bg-black/30 rounded">
                            {selectedAsset.path || selectedAsset.url}
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="space-y-2">
                    <button
                        onClick={toggleSlideshow}
                        className={`w-full py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 ${slideshowActive ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-white/10 hover:bg-white/20'}`}
                    >
                        {slideshowActive ? <><Pause className="w-3.5 h-3.5" /> Stop Slideshow</> : <><Play className="w-3.5 h-3.5" /> Start Slideshow</>}
                    </button>
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
