import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../context/StoreContext';
import { Terminal, Loader2, Plus, X } from 'lucide-react';
import { fsApi, kernelApi } from '../../services/tauriApi';

interface TerminalLine {
    type: 'input' | 'output' | 'error' | 'system';
    content: string;
    path?: string;
    timestamp: Date;
}

interface TerminalTab {
    id: string;
    name: string;
    history: TerminalLine[];
    path: string;
    commandHistory: string[];
}

// Simple ANSI to HTML parser
function parseAnsi(text: string): React.ReactNode {
    // Common ANSI codes mapping
    const ansiColors: Record<string, string> = {
        '30': 'text-black', '31': 'text-red-500', '32': 'text-green-500',
        '33': 'text-yellow-500', '34': 'text-blue-500', '35': 'text-purple-500',
        '36': 'text-cyan-500', '37': 'text-white', '90': 'text-zinc-500',
        '91': 'text-red-400', '92': 'text-green-400', '93': 'text-yellow-400',
        '94': 'text-blue-400', '95': 'text-purple-400', '96': 'text-cyan-400',
        '1': 'font-bold', '0': ''
    };

    // Regex to match ANSI escape codes
    const ansiRegex = /\x1b\[([0-9;]+)m/g;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let currentClass = '';
    let match;

    while ((match = ansiRegex.exec(text)) !== null) {
        // Add text before the ANSI code
        if (match.index > lastIndex) {
            parts.push(
                <span key={lastIndex} className={currentClass}>
                    {text.slice(lastIndex, match.index)}
                </span>
            );
        }

        // Parse ANSI codes
        const codes = match[1].split(';');
        codes.forEach(code => {
            if (code === '0') {
                currentClass = '';
            } else if (ansiColors[code]) {
                currentClass = ansiColors[code];
            }
        });

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push(
            <span key={lastIndex} className={currentClass}>
                {text.slice(lastIndex)}
            </span>
        );
    }

    return parts.length > 0 ? <>{parts}</> : text;
}

export function SystemTerminal() {
    const { addThought, spawnArtifact, setFocusMode } = useStore();

    const [tabs, setTabs] = useState<TerminalTab[]>([{
        id: 'tab-1',
        name: 'Terminal 1',
        history: [
            { type: 'system', content: 'Nexus Kernel v3.1.0-generic [x86_64]', timestamp: new Date() },
            { type: 'system', content: 'Type "help" for available commands.', timestamp: new Date() }
        ],
        path: typeof window !== 'undefined' && navigator.platform?.startsWith('Win') ? 'C:/Users' : '/home',
        commandHistory: []
    }]);
    const [activeTabId, setActiveTabId] = useState('tab-1');
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const nextTabId = useRef(2);

    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

    // Auto-scroll to bottom — use scrollTop on the container to prevent ancestor scroll
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, [activeTab?.history]);

    const handleClick = () => {
        inputRef.current?.focus();
    };

    const addToHistory = (line: TerminalLine) => {
        setTabs(prev => prev.map(t =>
            t.id === activeTabId
                ? { ...t, history: [...t.history, line] }
                : t
        ));
    };

    const setPath = (newPath: string) => {
        setTabs(prev => prev.map(t =>
            t.id === activeTabId ? { ...t, path: newPath } : t
        ));
    };

    const addCommandToHistory = (cmd: string) => {
        setTabs(prev => prev.map(t =>
            t.id === activeTabId
                ? { ...t, commandHistory: [cmd, ...t.commandHistory.filter(c => c !== cmd)].slice(0, 50) }
                : t
        ));
    };

    const handleCommand = async (cmd: string) => {
        if (!cmd.trim()) return;

        const args = cmd.trim().split(' ');
        const main = args[0].toLowerCase();
        const path = activeTab.path;

        // Record input
        addToHistory({ type: 'input', content: cmd, path, timestamp: new Date() });
        addCommandToHistory(cmd);
        setHistoryIndex(-1);
        setIsProcessing(true);

        try {
            switch (main) {
                case 'help':
                    addToHistory({
                        type: 'output', content: `
AVAILABLE COMMANDS:
  ls        List directory contents
  cd        Change working directory
  cat       Read file content
  clear     Clear terminal
  whoami    Print current user identity
  date      Print system time
  nexus     Query Nexus Kernel status
  status    Check active agents
  pwd       Print working directory
  echo      Print arguments
`, timestamp: new Date()
                    });
                    break;

                case 'ls':
                    try {
                        const targetPath = args[1] ? resolvePath(args[1], path) : path;
                        const files = await fsApi.readDir(targetPath);
                        const output = files.map(f => {
                            const suffix = f.isDirectory ? '/' : '';
                            return f.name + suffix;
                        }).join('    ');
                        addToHistory({ type: 'output', content: output || '(empty)', timestamp: new Date() });
                    } catch (e) {
                        addToHistory({ type: 'error', content: `ls: cannot access '${args[1] || path}': No such file or directory`, timestamp: new Date() });
                    }
                    break;

                case 'cat':
                    if (!args[1]) {
                        addToHistory({ type: 'error', content: 'usage: cat [file]', timestamp: new Date() });
                    } else {
                        try {
                            const targetPath = resolvePath(args[1], path);
                            const content = await fsApi.readTextFile(targetPath);

                            if (content.length > 500) {
                                spawnArtifact({
                                    id: `file-${Date.now()}`,
                                    title: args[1],
                                    type: 'code',
                                    content: content,
                                    isVisible: true
                                });
                                addToHistory({ type: 'system', content: `>> Opened ${args[1]} in artifact viewer (too large for terminal).`, timestamp: new Date() });
                            } else {
                                addToHistory({ type: 'output', content: content, timestamp: new Date() });
                            }
                        } catch (e) {
                            addToHistory({ type: 'error', content: `cat: ${args[1]}: No such file or directory`, timestamp: new Date() });
                        }
                    }
                    break;

                case 'cd':
                    if (!args[1]) {
                        // Go home
                        const isWin = typeof navigator !== 'undefined' && navigator.platform?.startsWith('Win');
                        setPath(isWin ? 'C:/Users' : '/home');
                    } else if (args[1] === '..') {
                        const parent = path.split('/').slice(0, -1).join('/');
                        if (parent) setPath(parent);
                    } else {
                        const newPath = resolvePath(args[1], path);
                        try {
                            await fsApi.readDir(newPath);
                            setPath(newPath);
                        } catch (e) {
                            addToHistory({ type: 'error', content: `cd: ${args[1]}: No such directory`, timestamp: new Date() });
                        }
                    }
                    break;

                case 'pwd':
                    addToHistory({ type: 'output', content: path, timestamp: new Date() });
                    break;

                case 'echo':
                    addToHistory({ type: 'output', content: args.slice(1).join(' '), timestamp: new Date() });
                    break;

                case 'clear':
                    setTabs(prev => prev.map(t =>
                        t.id === activeTabId ? { ...t, history: [] } : t
                    ));
                    break;

                case 'whoami':
                    addToHistory({ type: 'output', content: 'developer', timestamp: new Date() });
                    break;

                case 'date':
                    addToHistory({ type: 'output', content: new Date().toString(), timestamp: new Date() });
                    break;

                case 'nexus':
                case 'status':
                    try {
                        const status = await kernelApi.getStatus();
                        const stats = await kernelApi.getModelStats();
                        addToHistory({
                            type: 'system', content: `
NEXUS KERNEL STATUS: ${status.status.toUpperCase()}
PID: ${status.process_id || 'N/A'}
Uptime: ${status.uptime_seconds || 0}s

ACTIVE MODEL: ${stats.default_model || 'Unknown'}
ROUTING: ${stats.llm_routing_enabled ? 'ENABLED' : 'DISABLED'}
`, timestamp: new Date()
                        });
                    } catch (e) {
                        addToHistory({ type: 'error', content: 'Failed to contact kernel.', timestamp: new Date() });
                    }
                    break;

                default:
                    // Execute via kernel shell
                    try {
                        const output = await kernelApi.executeShell(cmd, path);
                        addToHistory({ type: 'output', content: output, timestamp: new Date() });
                    } catch (e: any) {
                        addToHistory({ type: 'error', content: e.message || `Error executing '${main}'`, timestamp: new Date() });
                    }
                    break;
            }
        } catch (e) {
            addToHistory({ type: 'error', content: `Execution Error: ${e}`, timestamp: new Date() });
        } finally {
            setIsProcessing(false);
        }

        setInput('');
    };

    const resolvePath = (target: string, currentPath: string) => {
        if (target.startsWith('/') || target.includes(':')) return target;
        return `${currentPath}/${target}`;
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isProcessing) {
            handleCommand(input);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const cmdHistory = activeTab.commandHistory;
            if (cmdHistory.length > 0) {
                const newIndex = Math.min(historyIndex + 1, cmdHistory.length - 1);
                setHistoryIndex(newIndex);
                setInput(cmdHistory[newIndex]);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const cmdHistory = activeTab.commandHistory;
            if (historyIndex > 0) {
                const newIndex = historyIndex - 1;
                setHistoryIndex(newIndex);
                setInput(cmdHistory[newIndex]);
            } else if (historyIndex === 0) {
                setHistoryIndex(-1);
                setInput('');
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            // Basic tab completion for file paths
            if (input.trim()) {
                const parts = input.split(' ');
                const lastPart = parts[parts.length - 1];
                if (lastPart) {
                    // Try to complete
                    const dir = lastPart.includes('/')
                        ? lastPart.substring(0, lastPart.lastIndexOf('/') + 1)
                        : '';
                    const prefix = lastPart.includes('/')
                        ? lastPart.substring(lastPart.lastIndexOf('/') + 1)
                        : lastPart;

                    const searchPath = resolvePath(dir || '.', activeTab.path);
                    fsApi.readDir(searchPath).then(files => {
                        const matches = files.filter(f => f.name.toLowerCase().startsWith(prefix.toLowerCase()));
                        if (matches.length === 1) {
                            const completion = dir + matches[0].name + (matches[0].isDirectory ? '/' : '');
                            parts[parts.length - 1] = completion;
                            setInput(parts.join(' '));
                        } else if (matches.length > 1) {
                            // Show options
                            addToHistory({
                                type: 'output',
                                content: matches.map(f => f.name + (f.isDirectory ? '/' : '')).join('  '),
                                timestamp: new Date()
                            });
                        }
                    }).catch(() => { });
                }
            }
        }
    };

    const addNewTab = () => {
        const newTab: TerminalTab = {
            id: `tab-${nextTabId.current++}`,
            name: `Terminal ${nextTabId.current - 1}`,
            history: [
                { type: 'system', content: 'New terminal session.', timestamp: new Date() }
            ],
            path: typeof window !== 'undefined' && navigator.platform?.startsWith('Win') ? 'C:/Users' : '/home',
            commandHistory: []
        };
        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newTab.id);
    };

    const closeTab = (id: string) => {
        if (tabs.length === 1) return;
        const idx = tabs.findIndex(t => t.id === id);
        const newTabs = tabs.filter(t => t.id !== id);
        setTabs(newTabs);
        if (activeTabId === id) {
            setActiveTabId(newTabs[Math.max(0, idx - 1)].id);
        }
    };

    return (
        <div className="h-full bg-[#0c0c0c] text-zinc-300 font-mono text-sm overflow-hidden flex flex-col">
            {/* Tab Bar */}
            <div className="flex items-center bg-[#1a1a1a] border-b border-zinc-800 overflow-x-auto shrink-0">
                {tabs.map(tab => (
                    <div
                        key={tab.id}
                        className={`group flex items-center gap-2 px-3 py-2 text-xs cursor-pointer border-r border-zinc-800 shrink-0 ${tab.id === activeTabId ? 'bg-[#0c0c0c] text-zinc-100' : 'text-zinc-500 hover:bg-zinc-900'
                            }`}
                        onClick={() => setActiveTabId(tab.id)}
                    >
                        <Terminal className="w-3 h-3" />
                        <span>{tab.name}</span>
                        {tabs.length > 1 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                                className="p-0.5 rounded hover:bg-zinc-700 opacity-0 group-hover:opacity-100"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                ))}
                <button
                    onClick={addNewTab}
                    className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
                    title="New Tab"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            {/* Terminal Content */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-1" onClick={handleClick}>
                {activeTab.history.map((line, i) => (
                    <div key={i} className={`${line.type === 'error' ? 'text-red-400' : line.type === 'system' ? 'text-blue-400' : ''} break-words whitespace-pre-wrap`}>
                        {line.type === 'input' && (
                            <span className="mr-2">
                                <span className="text-green-500 font-bold">developer@nexus</span>
                                <span className="text-zinc-500">:</span>
                                <span className="text-blue-500 font-bold">{line.path?.split('/').pop() || '~'}</span>
                                <span className="text-zinc-500">$</span>
                            </span>
                        )}
                        <span>{parseAnsi(line.content)}</span>
                    </div>
                ))}

                <div className="flex items-center">
                    <span className="mr-2 shrink-0">
                        <span className="text-green-500 font-bold">developer@nexus</span>
                        <span className="text-zinc-500">:</span>
                        <span className="text-blue-500 font-bold">{activeTab.path.split('/').pop() || '~'}</span>
                        <span className="text-zinc-500">$</span>
                    </span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            // Ctrl+C to break
                            if (e.ctrlKey && e.key === 'c') {
                                e.preventDefault();
                                setIsProcessing(false);
                                addToHistory({ type: 'system', content: '^C', timestamp: new Date() });
                                setInput('');
                                return;
                            }
                            handleKeyDown(e);
                        }}
                        disabled={isProcessing}
                        className="bg-transparent border-none outline-none flex-1 text-zinc-100 disabled:opacity-50"
                        autoFocus
                        autoComplete="off"
                        spellCheck="false"
                    />
                    {isProcessing && (
                        <div className="flex items-center gap-2">
                            <Loader2 className="w-3 h-3 animate-spin text-blue-500 ml-2" />
                            <span className="text-xs text-zinc-500">(Ctrl+C to interrupt UI)</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
