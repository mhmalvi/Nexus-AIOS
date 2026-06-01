
import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw, Search, Lock, Unlock, Star, X, Plus, Globe, AlertTriangle, ExternalLink, Home, History, Sparkles, Loader2, Trash2 } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { aiService } from '../../services/aiService';

import tauriApi from '../../services/tauriApi';

interface Tab {
    id: number;
    title: string;
    url: string;
    active: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    screenshot?: string; // Base64 screenshot
}

interface HistoryItem {
    url: string;
    title: string;
    timestamp: number;
}

export function WebBrowser() {
    const { addNotification } = useStore();
    const [tabs, setTabs] = useState<Tab[]>([
        { id: 1, title: 'Welcome', url: '', active: true, canGoBack: false, canGoForward: false },
    ]);
    const [inputUrl, setInputUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showBookmarks, setShowBookmarks] = useState(false);
    const [useRemote, setUseRemote] = useState(true); // Default to Remote Browser (Playwright)

    // Side Panel State
    const [rightPanel, setRightPanel] = useState<'history' | 'summary' | null>(null);
    const [history, setHistory] = useState<HistoryItem[]>(() => {
        try {
            const saved = localStorage.getItem('nexus_browser_history');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const [aiSummary, setAiSummary] = useState<string>('');
    const [isSummarizing, setIsSummarizing] = useState(false);

    const [bookmarks, setBookmarks] = useState<{ url: string, title: string }[]>(() => {
        try {
            const saved = localStorage.getItem('nexus_bookmarks');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const nextTabId = useRef(2);

    const activeTab = tabs.find(t => t.active);

    const addToHistory = (url: string, title: string) => {
        if (!url) return;
        const newItem: HistoryItem = { url, title, timestamp: Date.now() };
        const newHistory = [newItem, ...history].slice(0, 100); // Keep last 100
        setHistory(newHistory);
        localStorage.setItem('nexus_browser_history', JSON.stringify(newHistory));
    };

    const clearHistory = () => {
        setHistory([]);
        localStorage.setItem('nexus_browser_history', JSON.stringify([]));
    };

    const handleSummarize = async () => {
        if (!activeTab?.url) return;
        setRightPanel('summary');
        setAiSummary('');
        setIsSummarizing(true);

        try {
            const prompt = `Please summarize the website at this URL: ${activeTab.url}. 
            If you can't allow browsing referenced links, just infer the content from the domain and path or explain what this site typically contains. 
            Keep it concise.`;

            await aiService.sendMessage(prompt, (chunk) => {
                setAiSummary(prev => prev + chunk);
            });
        } catch (e) {
            setAiSummary("Could not generate summary. AI service offline.");
        } finally {
            setIsSummarizing(false);
        }
    };

    // ... (rest of quickLinks array)
    const quickLinks = [
        { name: 'Google', url: 'https://www.google.com', icon: '🔍' },
        { name: 'GitHub', url: 'https://github.com', icon: '🐙' },
        { name: 'Stack Overflow', url: 'https://stackoverflow.com', icon: '📚' },
        { name: 'MDN Docs', url: 'https://developer.mozilla.org', icon: '📖' },
        { name: 'Hacker News', url: 'https://news.ycombinator.com', icon: '📰' },
        { name: 'Reddit', url: 'https://www.reddit.com', icon: '🤖' },
    ];

    const formatUrl = (input: string): string => {
        let url = input.trim();
        if (!url) return '';

        // Check if it's a search query (no dots and not a protocol)
        if (!url.includes('.') && !url.startsWith('http')) {
            return `https://duckduckgo.com/?q=${encodeURIComponent(url)}`;
        }

        // Add https if no protocol
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        return url;
    };

    const navigate = async (urlToLoad: string) => {
        const formattedUrl = formatUrl(urlToLoad);
        if (!formattedUrl) return;

        setIsLoading(true);
        setError(null);
        setInputUrl(formattedUrl);

        if (useRemote) {
            try {
                // Use Kernel Browser (Gap 4)
                const res = await tauriApi.browser.navigate(formattedUrl);
                if (res.success && res.data) {
                    setTabs(prev => prev.map(tab =>
                        tab.active
                            ? {
                                ...tab,
                                url: res.data.url,
                                title: res.data.title || new URL(formattedUrl).hostname,
                                screenshot: res.data.screenshot
                            }
                            : tab
                    ));
                    addToHistory(res.data.url, res.data.title || new URL(formattedUrl).hostname);
                } else {
                    setError(res.error || 'Failed to load page');
                }
            } catch (e) {
                console.error(e);
                setError('Kernel connection failed');
            } finally {
                setIsLoading(false);
            }
        } else {
            // Use Local Iframe
            setTabs(prev => prev.map(tab =>
                tab.active
                    ? { ...tab, url: formattedUrl, title: new URL(formattedUrl).hostname || 'Loading...', screenshot: undefined }
                    : tab
            ));
            addToHistory(formattedUrl, new URL(formattedUrl).hostname);
            // isLoading is handled by iframe events
        }
    };

    const handleNavigate = (e: React.FormEvent) => {
        e.preventDefault();
        navigate(inputUrl);
    };

    const handleQuickLink = (url: string) => {
        setInputUrl(url);
        navigate(url);
    };

    const handleIframeLoad = () => {
        setIsLoading(false);
        // Try to get the page title (may fail due to CORS)
        try {
            const iframe = iframeRef.current;
            if (iframe && iframe.contentDocument) {
                const title = iframe.contentDocument.title;
                if (title) {
                    setTabs(prev => prev.map(tab =>
                        tab.active ? { ...tab, title } : tab
                    ));
                }
            }
        } catch (e) {
            // CORS prevents access, use hostname as title
        }
    };

    const handleIframeError = () => {
        setIsLoading(false);
        setError('Unable to load this page. It may be blocking embedded access.');
    };

    const handleRemoteClick = async (e: React.MouseEvent<HTMLImageElement>) => {
        if (!activeTab?.screenshot || !imgRef.current) return;

        const rect = imgRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Scale coordinates if image is resized
        const scaleX = 1920 / rect.width; // Assuming 1920x1080 viewport 
        const scaleY = 1080 / rect.height;

        const targetX = x * scaleX;
        const targetY = y * scaleY;

        setIsLoading(true);
        try {
            await tauriApi.browser.click(undefined, targetX, targetY);
            // Refresh
            const res = await tauriApi.browser.getState(); // Or screenshot
            const screenRes = await tauriApi.browser.navigate(activeTab.url); // Re-nav to get fresh screenshot for now
            if (screenRes.success && screenRes.data) {
                setTabs(prev => prev.map(t => t.active ? { ...t, screenshot: screenRes.data.screenshot } : t));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const addNewTab = () => {
        const newTab: Tab = {
            id: nextTabId.current++,
            title: 'New Tab',
            url: '',
            active: true,
            canGoBack: false,
            canGoForward: false
        };
        setTabs(prev => [...prev.map(t => ({ ...t, active: false })), newTab]);
        setInputUrl('');
        setError(null);
    };

    const closeTab = (id: number) => {
        if (tabs.length === 1) {
            // Don't close the last tab, just reset it
            setTabs([{ id: 1, title: 'Welcome', url: '', active: true, canGoBack: false, canGoForward: false }]);
            setInputUrl('');
            return;
        }

        const tabIndex = tabs.findIndex(t => t.id === id);
        const wasActive = tabs[tabIndex].active;
        const newTabs = tabs.filter(t => t.id !== id);

        if (wasActive && newTabs.length > 0) {
            // Activate the previous tab or the first one
            const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
            newTabs[newActiveIndex].active = true;
            setInputUrl(newTabs[newActiveIndex].url);
        }

        setTabs(newTabs);
    };

    const switchTab = (id: number) => {
        setTabs(prev => prev.map(t => ({ ...t, active: t.id === id })));
        const tab = tabs.find(t => t.id === id);
        if (tab) {
            setInputUrl(tab.url);
            setError(null);
        }
    };

    const openExternal = () => {
        if (activeTab?.url) {
            window.open(activeTab.url, '_blank');
            addNotification({
                title: 'Opened in External Browser',
                message: `Navigating to ${new URL(activeTab.url).hostname}`,
                type: 'info'
            });
        }
    };

    const goHome = () => {
        setTabs(prev => prev.map(tab =>
            tab.active ? { ...tab, url: '', title: 'Welcome' } : tab
        ));
        setInputUrl('');
        setError(null);
    };

    const addBookmark = () => {
        if (!activeTab?.url) return;
        const exists = bookmarks.some(b => b.url === activeTab.url);
        if (exists) {
            const newBookmarks = bookmarks.filter(b => b.url !== activeTab.url);
            setBookmarks(newBookmarks);
            localStorage.setItem('nexus_bookmarks', JSON.stringify(newBookmarks));
            addNotification({ title: 'Bookmark Removed', message: activeTab.title, type: 'info' });
        } else {
            const newBookmarks = [...bookmarks, { url: activeTab.url, title: activeTab.title }];
            setBookmarks(newBookmarks);
            localStorage.setItem('nexus_bookmarks', JSON.stringify(newBookmarks));
            addNotification({ title: 'Bookmark Added', message: activeTab.title, type: 'success' });
        }
    };

    const isBookmarked = activeTab?.url ? bookmarks.some(b => b.url === activeTab.url) : false;

    const isSecure = activeTab?.url.startsWith('https://');
    const showWelcome = !activeTab?.url;

    return (
        <div className="flex flex-col h-full bg-background font-sans">

            {/* Tab Bar */}
            <div className="flex items-center pt-2 px-2 gap-1 bg-muted/20 border-b border-border/50 select-none overflow-x-auto">
                {tabs.map(tab => (
                    <div
                        key={tab.id}
                        className={`
                            group relative flex items-center gap-2 px-3 py-2 rounded-t-lg text-xs max-w-[180px] min-w-[100px] cursor-pointer shrink-0
                            ${tab.active ? 'bg-background text-foreground shadow-sm' : 'bg-transparent text-muted-foreground hover:bg-muted/40'}
                        `}
                        onClick={() => switchTab(tab.id)}
                    >
                        <Globe className="w-3 h-3 shrink-0 opacity-50" />
                        <span className="truncate flex-1">{tab.title}</span>
                        <button
                            onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                            className={`p-0.5 rounded-md hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity ${tab.active ? 'opacity-50 hover:opacity-100' : ''}`}
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ))}
                <button
                    onClick={addNewTab}
                    className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground ml-1 shrink-0"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            {/* Toolbar */}
            <div className="h-10 border-b border-border/50 flex items-center gap-2 px-2 bg-background">
                <div className="flex gap-1">
                    <button
                        onClick={goHome}
                        className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground"
                        title="Home"
                    >
                        <Home className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => iframeRef.current?.contentWindow?.history.back()}
                        className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground disabled:opacity-30"
                        disabled={!activeTab?.url}
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => iframeRef.current?.contentWindow?.history.forward()}
                        className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground disabled:opacity-30"
                        disabled={!activeTab?.url}
                    >
                        <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => activeTab?.url && navigate(activeTab.url)}
                        className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground"
                    >
                        <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={addBookmark}
                        className={`p-1.5 rounded-md hover:bg-muted/50 transition-colors ${isBookmarked ? 'text-yellow-500' : 'text-muted-foreground'}`}
                        disabled={!activeTab?.url}
                        title={isBookmarked ? 'Remove Bookmark' : 'Add Bookmark'}
                    >
                        <Star className={`w-4 h-4 ${isBookmarked ? 'fill-yellow-500' : ''}`} />
                    </button>
                    <div className="w-px h-4 bg-border/50 mx-1" />
                    <button
                        onClick={() => setRightPanel(rightPanel === 'history' ? null : 'history')}
                        className={`p-1.5 rounded-md hover:bg-muted/50 transition-colors ${rightPanel === 'history' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
                        title="History"
                    >
                        <History className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleSummarize}
                        className={`p-1.5 rounded-md hover:bg-muted/50 transition-colors ${rightPanel === 'summary' ? 'bg-muted text-blue-500' : 'text-muted-foreground'}`}
                        disabled={!activeTab?.url}
                        title="AI Summary"
                    >
                        <Sparkles className="w-4 h-4" />
                    </button>
                    <div className="w-px h-4 bg-border/50 mx-1" />
                    <button
                        onClick={() => setUseRemote(!useRemote)}
                        className={`p-1.5 rounded-md hover:bg-muted/50 transition-colors ${useRemote ? 'text-primary' : 'text-muted-foreground'}`}
                        title={useRemote ? "Remote Kernel Mode" : "Local Iframe Mode"}
                    >
                        <Globe className={`w-4 h-4 ${useRemote ? 'text-blue-500' : ''}`} />
                    </button>
                </div>

                <form onSubmit={handleNavigate} className="flex-1">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none">
                            {activeTab?.url ? (
                                isSecure ? (
                                    <Lock className="w-3 h-3 text-green-500" />
                                ) : (
                                    <Unlock className="w-3 h-3 text-orange-500" />
                                )
                            ) : (
                                <Search className="w-3 h-3 text-muted-foreground" />
                            )}
                        </div>
                        <input
                            value={inputUrl}
                            onChange={(e) => setInputUrl(e.target.value)}
                            placeholder="Search or enter URL..."
                            className="w-full h-7 bg-muted/30 hover:bg-muted/50 focus:bg-background border border-transparent focus:border-primary/30 rounded-full pl-7 pr-8 text-xs focus:outline-none transition-all"
                        />
                        {activeTab?.url && (
                            <div className="absolute inset-y-0 right-2 flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={openExternal}
                                    className="p-0.5 hover:bg-muted rounded"
                                    title="Open in external browser"
                                >
                                    <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                                </button>
                            </div>
                        )}
                    </div>
                </form>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Viewport */}
                <div className="flex-1 relative bg-white dark:bg-zinc-900 overflow-hidden">
                    {isLoading && (
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-muted overflow-hidden z-20">
                            <div className="h-full bg-primary animate-progress origin-left" />
                        </div>
                    )}

                    {showWelcome ? (
                        /* Welcome Page */
                        <div className="w-full h-full flex flex-col items-center justify-center p-10 text-center">
                            <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-blue-500/20 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
                                <Globe className="w-10 h-10 text-primary" />
                            </div>
                            <h3 className="text-2xl font-light text-foreground mb-2">Quantum Browser</h3>
                            <p className="text-sm text-muted-foreground mb-8 max-w-md">
                                Browse the web securely through the Nexus Neural Proxy.
                                Search anything or enter a URL above.
                            </p>

                            {/* Quick Links */}
                            <div className="grid grid-cols-3 gap-3 max-w-md">
                                {quickLinks.map(link => (
                                    <button
                                        key={link.url}
                                        onClick={() => handleQuickLink(link.url)}
                                        className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 border border-border/50 hover:border-primary/30 transition-all group"
                                    >
                                        <span className="text-2xl group-hover:scale-110 transition-transform">{link.icon}</span>
                                        <span className="text-xs text-muted-foreground group-hover:text-foreground">{link.name}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Bookmarks Section */}
                            {bookmarks.length > 0 && (
                                <div className="mt-8 max-w-md w-full">
                                    <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Bookmarks</h4>
                                    <div className="grid grid-cols-3 gap-2">
                                        {bookmarks.slice(0, 6).map(b => (
                                            <button
                                                key={b.url}
                                                onClick={() => handleQuickLink(b.url)}
                                                className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 text-left truncate"
                                            >
                                                <Star className="w-3 h-3 text-yellow-500 shrink-0" />
                                                <span className="text-xs truncate">{b.title}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : error ? (
                        /* Error State */
                        <div className="w-full h-full flex flex-col items-center justify-center p-10 text-center">
                            <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mb-4">
                                <AlertTriangle className="w-8 h-8 text-orange-500" />
                            </div>
                            <h3 className="text-lg font-medium text-foreground mb-2">Page Cannot Be Displayed</h3>
                            <p className="text-sm text-muted-foreground max-w-md mb-4">{error}</p>
                            <div className="flex gap-2">
                                <button
                                    onClick={openExternal}
                                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 flex items-center gap-2"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    Open Externally
                                </button>
                                <button
                                    onClick={goHome}
                                    className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm hover:bg-muted/80"
                                >
                                    Go Home
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Browser View */
                        useRemote ? (
                            activeTab?.screenshot ? (
                                <div className="w-full h-full overflow-auto bg-gray-100 flex items-center justify-center">
                                    <img
                                        ref={imgRef}
                                        src={`data:image/png;base64,${activeTab.screenshot}`}
                                        alt="Browser Content"
                                        className="max-w-full max-h-full shadow-lg border border-border"
                                        onClick={handleRemoteClick}
                                        style={{ cursor: 'crosshair' }}
                                    />
                                </div>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                    <Loader2 className="w-8 h-8 animate-spin mb-2" />
                                    Loading Remote Content...
                                </div>
                            )
                        ) : (
                            <iframe
                                ref={iframeRef}
                                src={activeTab?.url}
                                className="w-full h-full border-none"
                                onLoad={handleIframeLoad}
                                onError={handleIframeError}
                                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                                title="Browser Content"
                            />
                        )
                    )}
                </div>

                {/* Right Sidebar Panel */}
                {rightPanel && (
                    <div className="w-80 border-l border-border/50 bg-background flex flex-col transition-all">
                        <div className="h-10 border-b border-border/50 flex items-center justify-between px-4">
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                {rightPanel === 'history' ? 'Browsing History' : 'Page Insight'}
                            </span>
                            <button onClick={() => setRightPanel(null)}>
                                <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-0">
                            {rightPanel === 'history' && (
                                <div className="flex flex-col">
                                    {history.length === 0 ? (
                                        <div className="p-8 text-center text-muted-foreground text-xs">No history yet</div>
                                    ) : (
                                        <>
                                            <div className="p-2 flex justify-end border-b border-border/30">
                                                <button onClick={clearHistory} className="text-[10px] text-red-500 hover:text-red-400 flex items-center gap-1">
                                                    <Trash2 className="w-3 h-3" /> Clear History
                                                </button>
                                            </div>
                                            {history.map((item, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => { navigate(item.url); }}
                                                    className="flex flex-col gap-1 p-3 border-b border-border/30 hover:bg-muted/30 text-left group"
                                                >
                                                    <span className="text-sm truncate w-full group-hover:text-primary transition-colors">{item.title}</span>
                                                    <span className="text-[10px] text-muted-foreground truncate w-full">{item.url}</span>
                                                    <span className="text-[10px] text-muted-foreground opacity-50">{new Date(item.timestamp).toLocaleTimeString()}</span>
                                                </button>
                                            ))}
                                        </>
                                    )}
                                </div>
                            )}

                            {rightPanel === 'summary' && (
                                <div className="p-4">
                                    {isSummarizing ? (
                                        <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
                                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                            <span className="text-xs">Analyzing page content...</span>
                                        </div>
                                    ) : (
                                        <div className="prose prose-sm dark:prose-invert">
                                            <div className="bg-muted/30 p-4 rounded-lg border border-border/50 text-sm leading-relaxed">
                                                {aiSummary || "No summary available."}
                                            </div>
                                            <div className="mt-4 flex gap-2">
                                                <button onClick={handleSummarize} className="text-xs bg-primary/10 text-primary px-3 py-1.5 rounded hover:bg-primary/20 transition-colors">
                                                    Regenerate
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
