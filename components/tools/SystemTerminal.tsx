
import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../context/StoreContext';
import { Terminal } from 'lucide-react';

interface TerminalLine {
    type: 'input' | 'output' | 'error' | 'system';
    content: string;
    path?: string;
    timestamp: Date;
}

export function SystemTerminal() {
    const { addThought, agent } = useStore();
    const [history, setHistory] = useState<TerminalLine[]>([
        { type: 'system', content: 'Nexus Kernel v3.1.0-generic [x86_64]', timestamp: new Date() },
        { type: 'system', content: 'Type "help" for available commands.', timestamp: new Date() }
    ]);
    const [input, setInput] = useState('');
    const [path, setPath] = useState('~');
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history]);

    // Auto-focus input when clicking anywhere in terminal
    const handleClick = () => {
        inputRef.current?.focus();
    };

    const handleCommand = (cmd: string) => {
        const args = cmd.trim().split(' ');
        const main = args[0].toLowerCase();
        
        // Record input
        const newHistory: TerminalLine[] = [
            ...history, 
            { type: 'input', content: cmd, path, timestamp: new Date() }
        ];

        let output: TerminalLine | null = null;

        switch(main) {
            case 'help':
                output = { type: 'output', content: `
GNU bash, version 5.1.16(1)-release (x86_64-pc-linux-gnu)
These shell commands are defined internally.  Type 'help' to see this list.

Available commands:
  ls        List directory contents
  cd        Change the shell working directory
  cat       Concatenate files and print on the standard output
  clear     Clear the terminal screen
  whoami    Print effective userid
  date      Print the system date and time
  echo      Write arguments to the standard output
  sudo      Execute a command as another user
  nexus     Interact with Nexus AIOS subsystems
  exit      Close terminal session
`, timestamp: new Date() };
                break;
            case 'ls':
                output = { type: 'output', content: `
Documents/    Downloads/    Projects/    
nexus.config.js    README.md    kernel.log    agent_manifest.json
`, timestamp: new Date() };
                break;
            case 'whoami':
                output = { type: 'output', content: 'developer', timestamp: new Date() };
                break;
            case 'date':
                output = { type: 'output', content: new Date().toString(), timestamp: new Date() };
                break;
            case 'clear':
                setHistory([]);
                setInput('');
                return;
            case 'cd':
                if (args[1]) {
                    if (args[1] === '..') setPath('~');
                    else setPath(`~/${args[1].replace(/\/$/, '')}`);
                    // output = { type: 'output', content: '', timestamp: new Date() };
                }
                break;
            case 'echo':
                output = { type: 'output', content: args.slice(1).join(' '), timestamp: new Date() };
                break;
            case 'sudo':
                output = { type: 'error', content: 'developer is not in the sudoers file. This incident will be reported.', timestamp: new Date() };
                addThought({
                    id: Date.now().toString(),
                    type: 'error',
                    component: 'sec-ops',
                    content: 'Security Alert: Unauthorized sudo attempt in terminal session.',
                    timestamp: new Date()
                });
                break;
            case 'nexus':
                output = { type: 'system', content: `Nexus Core Status: ONLINE\nActive Agents: ${4}\nSystem Load: 34%\nNeural Link: STABLE`, timestamp: new Date() };
                break;
            case '':
                break;
            default:
                output = { type: 'error', content: `bash: ${main}: command not found`, timestamp: new Date() };
                break;
        }

        if (output) newHistory.push(output);
        setHistory(newHistory);
        setInput('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleCommand(input);
        }
        if (e.key === 'c' && e.ctrlKey) {
             setHistory(prev => [...prev, { type: 'input', content: input + '^C', path, timestamp: new Date() }]);
             setInput('');
        }
        if (e.key === 'l' && e.ctrlKey) {
             e.preventDefault();
             setHistory([]);
        }
    };

    return (
        <div 
            className="h-full bg-[#0c0c0c] text-zinc-300 font-mono text-sm overflow-hidden flex flex-col p-4"
            onClick={handleClick}
        >
            <div className="flex-1 overflow-y-auto scrollbar-hide space-y-1">
                {history.map((line, i) => (
                    <div key={i} className={`${line.type === 'error' ? 'text-red-400' : line.type === 'system' ? 'text-blue-400' : ''} break-words whitespace-pre-wrap`}>
                        {line.type === 'input' && (
                            <span className="mr-2">
                                <span className="text-green-500 font-bold">developer@nexus</span>
                                <span className="text-zinc-500">:</span>
                                <span className="text-blue-500 font-bold">{line.path}</span>
                                <span className="text-zinc-500">$</span>
                            </span>
                        )}
                        <span>{line.content}</span>
                    </div>
                ))}
                
                <div className="flex items-center" ref={bottomRef}>
                    <span className="mr-2 shrink-0">
                        <span className="text-green-500 font-bold">developer@nexus</span>
                        <span className="text-zinc-500">:</span>
                        <span className="text-blue-500 font-bold">{path}</span>
                        <span className="text-zinc-500">$</span>
                    </span>
                    <input 
                        ref={inputRef}
                        type="text" 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="bg-transparent border-none outline-none flex-1 text-zinc-100"
                        autoFocus
                        autoComplete="off"
                        spellCheck="false"
                    />
                </div>
            </div>
        </div>
    );
}
