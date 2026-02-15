
import React, { useState, useEffect, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { FileCode, GitBranch, Search, Settings, ChevronRight, Play, X, Save, Box, Command, Loader2, ChevronDown, Sparkles, Send, Trash2, Menu, LayoutTemplate, Terminal, Monitor, PanelBottom, UserCircle } from 'lucide-react';
import { SystemTerminal } from './SystemTerminal';
import { useStore } from '../../context/StoreContext';
import { fsApi } from '../../services/tauriApi';
import { aiService } from '../../services/aiService';

interface EditorFile {
    name: string;
    path: string;
    content?: string;
    language: string;
    isDirty?: boolean;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export function CodeEditor() {
    const [activeFile, setActiveFile] = useState<EditorFile | null>(null);
    const [sidebarMode, setSidebarMode] = useState<'explorer' | 'search' | 'git' | 'ai'>('explorer');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [files, setFiles] = useState<EditorFile[]>([]);
    const [openFiles, setOpenFiles] = useState<EditorFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [rootDir, setRootDir] = useState(() => {
        if (typeof window !== 'undefined' && navigator.platform?.startsWith('Win')) {
            return 'C:/Users';
        }
        return '/home';
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [showSearch, setShowSearch] = useState(false);

    // AI State
    const [aiMessages, setAiMessages] = useState<ChatMessage[]>([
        { role: 'assistant', content: 'I am your code assistant. Open a file and ask me anything.' }
    ]);
    const [aiInput, setAiInput] = useState('');
    const [isAiThinking, setIsAiThinking] = useState(false);
    const [showTerminal, setShowTerminal] = useState(true);
    const [terminalHeight, setTerminalHeight] = useState(200);

    // Refs for synced scrolling
    const lineNumbersRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const aiScrollRef = useRef<HTMLDivElement>(null);

    // Global Store Integration
    const { selectedAsset, setSelectedAsset, addNotification } = useStore();

    useEffect(() => {
        if (aiScrollRef.current) {
            aiScrollRef.current.scrollTop = aiScrollRef.current.scrollHeight;
        }
    }, [aiMessages]);

    useEffect(() => {
        if (selectedAsset && selectedAsset.type === 'code') {
            const fileName = selectedAsset.name || selectedAsset.url.split('/').pop() || 'untitled';
            const file: EditorFile = {
                name: fileName,
                path: selectedAsset.url,
                language: getLanguage(fileName),
                content: ''
            };
            openFile(file);
        }
    }, [selectedAsset]);

    useEffect(() => {
        loadFiles();
    }, [rootDir]);

    const loadFiles = async () => {
        setLoading(true);
        try {
            const entries = await fsApi.readDir(rootDir);
            const mapped: EditorFile[] = entries
                .filter(e => e.isFile || e.isDirectory)
                .map(e => ({
                    name: e.name,
                    path: e.path,
                    language: getLanguage(e.name),
                    content: ''
                }))
                .sort((a, b) => {
                    if (a.path.includes('.') && !b.path.includes('.')) return 1;
                    if (!a.path.includes('.') && b.path.includes('.')) return -1;
                    return a.name.localeCompare(b.name)
                });
            setFiles(mapped);
        } catch (e) {
            console.error("Failed to load files", e);
        } finally {
            setLoading(false);
        }
    };

    const openFile = async (file: EditorFile) => {
        const existing = openFiles.find(f => f.path === file.path);
        if (!existing) {
            setOpenFiles([...openFiles, file]);
            setActiveFile(file);
            if (!file.content) {
                try {
                    const content = await fsApi.readTextFile(file.path);
                    const updated = { ...file, content, isDirty: false };
                    setActiveFile(updated);
                    setOpenFiles(prev => prev.map(f => f.path === file.path ? updated : f));

                    // Contextual AI update
                    setAiMessages(prev => [...prev, { role: 'assistant', content: `I've analyzed ${file.name}. Ready to assist.` }]);
                } catch (e) {
                    console.error("Failed to read file", e);
                }
            }
        } else {
            setActiveFile(existing);
        }
    };

    const saveFile = async () => {
        if (!activeFile || !activeFile.content) return;
        try {
            await fsApi.writeTextFile(activeFile.path, activeFile.content);
            const updated = { ...activeFile, isDirty: false };
            setActiveFile(updated);
            setOpenFiles(prev => prev.map(f => f.path === activeFile.path ? updated : f));
            addNotification({ title: 'Saved', message: activeFile.name, type: 'success' });
        } catch (e) {
            console.error("Failed to save file", e);
            addNotification({ title: 'Error', message: 'Could not save file', type: 'error' });
        }
    };

    const handleContentChange = (newContent: string) => {
        if (!activeFile) return;
        const updated = { ...activeFile, content: newContent, isDirty: true };
        setActiveFile(updated);
        setOpenFiles(prev => prev.map(f => f.path === activeFile.path ? updated : f));
    };



    const handleAiSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!aiInput.trim() || isAiThinking) return;

        const userMsg = aiInput;
        setAiInput('');
        setAiMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsAiThinking(true);

        const context = activeFile ? `Current File: ${activeFile.name}\nLang: ${activeFile.language}\nContent:\n${activeFile.content}\n\n` : "No active file.\n";
        const prompt = `${context}User Query: ${userMsg}\n\nProvide a helpful, standard coding assistant response. If code is requested, provide it in markdown blocks.`;

        try {
            await aiService.sendMessage(prompt, (chunk) => {
                setAiMessages(prev => {
                    const last = prev[prev.length - 1];
                    if (last.role === 'assistant') {
                        return [...prev.slice(0, -1), { role: 'assistant', content: last.content + chunk }];
                    } else {
                        return [...prev, { role: 'assistant', content: chunk }];
                    }
                });
            });
        } catch (err) {
            setAiMessages(prev => [...prev, { role: 'assistant', content: "Error communicating with AI kernel." }]);
        } finally {
            setIsAiThinking(false);
        }
    };

    const getLanguage = (name: string) => {
        if (name.endsWith('.ts') || name.endsWith('.tsx')) return 'typescript';
        if (name.endsWith('.js') || name.endsWith('.jsx')) return 'javascript';
        if (name.endsWith('.py')) return 'python';
        if (name.endsWith('.css')) return 'css';
        if (name.endsWith('.html')) return 'html';
        if (name.endsWith('.json')) return 'json';
        if (name.endsWith('.rs')) return 'rust';
        if (name.endsWith('.md')) return 'markdown';
        return 'plaintext';
    };

    const lines = activeFile?.content?.split('\n') || [''];

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] text-[#d4d4d4] font-mono text-sm overflow-hidden select-none">

            {/* Title Bar / Menu Bar */}
            <div className="h-8 min-h-[32px] flex items-center px-2 bg-[#3c3c3c] text-[#cccccc] text-[13px] select-none border-b border-[#252526]">
                <div className="flex items-center gap-2 mr-4">
                    <FileCode className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex items-center gap-3">
                    <span className="hover:bg-[#505050] px-1.5 rounded cursor-pointer">File</span>
                    <span className="hover:bg-[#505050] px-1.5 rounded cursor-pointer">Edit</span>
                    <span className="hover:bg-[#505050] px-1.5 rounded cursor-pointer">Selection</span>
                    <span className="hover:bg-[#505050] px-1.5 rounded cursor-pointer">View</span>
                    <span className="hover:bg-[#505050] px-1.5 rounded cursor-pointer">Go</span>
                    <span className="hover:bg-[#505050] px-1.5 rounded cursor-pointer">Run</span>
                    <span className="hover:bg-[#505050] px-1.5 rounded cursor-pointer">Terminal</span>
                    <span className="hover:bg-[#505050] px-1.5 rounded cursor-pointer">Help</span>
                </div>
                <div className="ml-auto flex items-center gap-3 text-xs text-[#999999]">
                    <span className="hover:text-white cursor-pointer flex items-center gap-1"><LayoutTemplate className="w-3.5 h-3.5" /> Layout</span>
                    <span className="hover:text-white cursor-pointer flex items-center gap-1" onClick={() => setShowTerminal(!showTerminal)}><PanelBottom className="w-3.5 h-3.5" /> Panel</span>
                </div>
            </div>

            {/* Main Workbench Area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Activity Bar */}
                <div className="w-12 flex flex-col items-center py-2 bg-[#333333] border-r border-[#252526]">
                    <div className="flex flex-col gap-4">
                        <div title="Explorer (Ctrl+Shift+E)" onClick={() => { setSidebarMode('explorer'); setSidebarOpen(true); }} className={`cursor-pointer border-l-2 py-1 px-3 ${sidebarMode === 'explorer' && sidebarOpen ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                            <FileCode className={`w-6 h-6 ${sidebarMode === 'explorer' && sidebarOpen ? 'text-white' : 'text-[#d4d4d4]'}`} />
                        </div>
                        <div title="Search (Ctrl+Shift+F)" onClick={() => { setSidebarMode('search'); setSidebarOpen(true); }} className={`cursor-pointer border-l-2 py-1 px-3 ${sidebarMode === 'search' && sidebarOpen ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                            <Search className={`w-6 h-6 ${sidebarMode === 'search' && sidebarOpen ? 'text-white' : 'text-[#d4d4d4]'}`} />
                        </div>
                        <div title="Source Control (Ctrl+Shift+G)" onClick={() => { setSidebarMode('git'); setSidebarOpen(true); }} className={`cursor-pointer border-l-2 py-1 px-3 ${sidebarMode === 'git' && sidebarOpen ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                            <GitBranch className={`w-6 h-6 ${sidebarMode === 'git' && sidebarOpen ? 'text-white' : 'text-[#d4d4d4]'}`} />
                        </div>
                        <div title="Extensions (Ctrl+Shift+X)" className="cursor-pointer border-l-2 border-transparent opacity-60 hover:opacity-100 py-1 px-3">
                            <Box className="w-6 h-6 text-[#d4d4d4]" />
                        </div>
                        <div title="AI Assistant" onClick={() => { setSidebarMode('ai'); setSidebarOpen(true); }} className={`cursor-pointer border-l-2 py-1 px-3 ${sidebarMode === 'ai' && sidebarOpen ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                            <Sparkles className={`w-6 h-6 ${sidebarMode === 'ai' && sidebarOpen ? 'text-blue-400' : 'text-blue-400/80'}`} />
                        </div>
                    </div>
                    <div className="mt-auto flex flex-col gap-4 mb-2">
                        <UserCircle className="w-6 h-6 text-[#d4d4d4] opacity-60 hover:opacity-100 cursor-pointer" />
                        <Settings className="w-6 h-6 text-[#d4d4d4] opacity-60 hover:opacity-100 cursor-pointer" />
                    </div>
                </div>

                {/* Sidebar */}
                {sidebarOpen && (
                    <div className="w-64 bg-[#252526] flex flex-col border-r border-[#1e1e1e]">
                        <div className="h-9 px-4 flex items-center text-[11px] font-bold tracking-widest uppercase text-[#bbbbbb] justify-between">
                            <span>{sidebarMode === 'ai' ? 'Code Assistant' : sidebarMode.toUpperCase()}</span>
                            <div className="flex gap-2">
                                {loading && <Loader2 className="w-3 h-3 animate-spin" />}
                                <X className="w-3.5 h-3.5 cursor-pointer hover:text-white" onClick={() => setSidebarOpen(false)} />
                            </div>
                        </div>

                        {sidebarMode === 'explorer' && (
                            <>
                                <div className="px-2 py-2">
                                    <input
                                        className="w-full bg-[#3c3c3c] border border-transparent text-xs text-white px-2 py-1 rounded focus:border-blue-500 focus:outline-none placeholder-white/30"
                                        value={rootDir}
                                        onChange={(e) => setRootDir(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') loadFiles(); }}
                                        placeholder="Root Path..."
                                    />
                                </div>
                                <div className="flex-1 overflow-y-auto py-2 scrollbar-hide">
                                    <div className="px-2 mb-1 flex items-center gap-1 text-xs font-bold text-blue-400 cursor-pointer hover:underline" title={rootDir} onClick={loadFiles}>
                                        <ChevronDown className="w-3.5 h-3.5" />
                                        WORKSPACE
                                    </div>
                                    <div className="flex flex-col">
                                        {files.map(file => (
                                            <div
                                                key={file.path}
                                                onClick={() => openFile(file)}
                                                className={`flex items-center gap-2 px-6 py-0.5 cursor-pointer hover:bg-[#2a2d2e] ${activeFile?.path === file.path ? 'bg-[#37373d] text-white' : 'text-[#cccccc]'}`}
                                            >
                                                <FileCode className={`w-3.5 h-3.5 ${activeFile?.path === file.path ? 'text-blue-300' : 'text-blue-300/50'}`} />
                                                <span className="text-[13px] truncate">{file.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                        {/* Re-use existing AI Mode logic here (simplified for brevity in this replacement, assuming existing logic) */}
                        {sidebarMode === 'ai' && (
                            <div className="flex-1 flex flex-col min-h-0">
                                <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={aiScrollRef}>
                                    {aiMessages.map((msg, idx) => (
                                        <div key={idx} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                            <div className={`p-2 rounded-lg max-w-[90%] text-xs leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-[#007acc] text-white' : 'bg-[#3c3c3c] text-[#e0e0e0]'}`}>
                                                {msg.content}
                                            </div>
                                        </div>
                                    ))}
                                    {isAiThinking && <div className="flex gap-1 items-center text-xs text-gray-500 pl-2"><Loader2 className="w-3 h-3 animate-spin" /> Thinking...</div>}
                                </div>
                                <div className="p-2 border-t border-[#333]">
                                    <form onSubmit={handleAiSubmit} className="relative">
                                        <input value={aiInput} onChange={e => setAiInput(e.target.value)} placeholder="Ask AI..." className="w-full bg-[#3c3c3c] text-white px-2 py-1.5 pr-8 rounded text-xs focus:outline-none" />
                                        <button type="submit" className="absolute right-1 top-1 p-0.5 hover:text-white text-gray-400"><Send className="w-3.5 h-3.5" /></button>
                                    </form>
                                </div>
                            </div>
                        )}
                        {(sidebarMode === 'search' || sidebarMode === 'git') && <div className="p-4 text-center text-gray-500 text-xs mt-10">Feature coming soon in v1.1</div>}
                    </div>
                )}

                {/* Editor Group */}
                <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
                    {/* Tabs */}
                    <div className="flex bg-[#252526] overflow-x-auto scrollbar-hide h-9">
                        {openFiles.map(file => (
                            <div
                                key={file.path}
                                onClick={() => setActiveFile(file)}
                                className={`
                                    flex items-center gap-2 px-3 py-1.5 text-[13px] cursor-pointer border-r border-[#252526] min-w-[120px] max-w-[200px] group select-none
                                    ${activeFile?.path === file.path ? 'bg-[#1e1e1e] text-white border-t-2 border-t-[#007acc]' : 'bg-[#2d2d2d] text-[#969696] hover:bg-[#2a2d2e] border-t-2 border-t-transparent'}
                                `}
                            >
                                <span className="flex-1 truncate">{file.name}</span>
                                <span className={`w-2 h-2 rounded-full ${file.isDirty ? 'bg-white' : 'opacity-0'} `} />
                                <X className="w-4 h-4 hover:bg-[#444] rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const newFiles = openFiles.filter(f => f.path !== file.path);
                                        setOpenFiles(newFiles);
                                        if (activeFile?.path === file.path) setActiveFile(newFiles[newFiles.length - 1] || null);
                                    }}
                                />
                            </div>
                        ))}
                    </div>

                    {activeFile ? (
                        <>
                            {/* Breadcrumbs (Toolbar replacement) */}
                            <div className="h-6 flex items-center px-4 gap-2 text-[11px] text-[#888] bg-[#1e1e1e]">
                                <span className="truncate hover:text-white transition-colors cursor-pointer">{activeFile.path.replace(/\//g, ' > ')}</span>
                                <div className="ml-auto flex items-center gap-2">
                                    <button className="p-1 hover:bg-[#333] rounded" onClick={saveFile} title="Save"><Save className={`w-3.5 h-3.5 ${activeFile.isDirty ? 'text-white' : 'text-[#ccc]'}`} /></button>
                                    <button className="p-1 hover:bg-[#333] rounded"><Play className="w-3.5 h-3.5 text-green-500" /></button>
                                </div>
                            </div>

                            {/* Monaco Editor */}
                            <div className="flex-1 relative font-mono text-[13px] leading-6 overflow-hidden flex flex-col">
                                <Editor
                                    height="100%"
                                    language={activeFile.language}
                                    value={activeFile.content || ''}
                                    theme="vs-dark"
                                    onChange={(value) => handleContentChange(value || '')}
                                    options={{
                                        minimap: { enabled: true },
                                        fontSize: 14,
                                        wordWrap: 'on',
                                        automaticLayout: true,
                                        scrollBeyondLastLine: false,
                                        padding: { top: 16, bottom: 16 },
                                        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                                        fontLigatures: true,
                                    }}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-[#555] select-none bg-[#1e1e1e]">
                            <div className="flex flex-col gap-4 text-center">
                                <Box className="w-24 h-24 text-[#333] mx-auto" />
                                <h1 className="text-2xl font-bold text-[#444] mb-2">Nexus Code</h1>
                                <div className="text-xs text-[#666] grid grid-cols-2 gap-x-8 gap-y-2 text-left">
                                    <span className="text-right">Show All Commands</span><span className="text-[#a0a0a0]">Ctrl+Shift+P</span>
                                    <span className="text-right">Go to File</span><span className="text-[#a0a0a0]">Ctrl+P</span>
                                    <span className="text-right">Find in Files</span><span className="text-[#a0a0a0]">Ctrl+Shift+F</span>
                                    <span className="text-right">Toggle Terminal</span><span className="text-[#a0a0a0]">Ctrl+`</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Integrated Terminal Panel */}
                    {showTerminal && (
                        <div className="border-t border-[#444]" style={{ height: terminalHeight }}>
                            <div className="flex items-center justify-between bg-[#252526] px-4 py-1.5 border-b border-[#252526]">
                                <div className="flex gap-4 text-[11px] font-bold text-[#cccccc]">
                                    <span className="underline decoration-blue-500 underline-offset-4 cursor-pointer">TERMINAL</span>
                                    <span className="opacity-50 hover:opacity-100 cursor-pointer">OUTPUT</span>
                                    <span className="opacity-50 hover:opacity-100 cursor-pointer">PROBLEMS</span>
                                    <span className="opacity-50 hover:opacity-100 cursor-pointer">DEBUG CONSOLE</span>
                                </div>
                                <div className="flex gap-2">
                                    <X className="w-3.5 h-3.5 cursor-pointer hover:text-white" onClick={() => setShowTerminal(false)} />
                                </div>
                            </div>
                            <div className="h-full bg-[#1e1e1e]">
                                <SystemTerminal />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Status Bar */}
            <div className="h-6 bg-[#007acc] text-white flex items-center px-3 text-[11px] justify-between select-none">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 hover:bg-white/10 px-1 rounded cursor-pointer transition-colors">
                        <GitBranch className="w-3 h-3" />
                        <span>main*</span>
                    </div>
                    {loading && <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving...</span>}
                    <div className="flex items-center gap-1 hover:bg-white/10 px-1 rounded cursor-pointer">
                        <X className="w-3 h-3 opacity-50" />
                        <span>0</span>
                        <Settings className="w-3 h-3 opacity-50" />
                        <span>0</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <span className="cursor-pointer hover:text-white/80">Ln {lines.length}, Col {activeFile?.content?.length || 0}</span>
                    <span className="cursor-pointer hover:text-white/80">UTF-8</span>
                    <span className="uppercase cursor-pointer hover:text-white/80">{activeFile?.language || 'Plain Text'}</span>
                    <span className="hover:bg-white/20 px-1 rounded cursor-pointer flex items-center gap-1"><Monitor className="w-3 h-3" /> Prettier</span>
                </div>
            </div>
        </div>
    );

}
