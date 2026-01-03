
import React, { useState } from 'react';
import { Package, Download, CheckCircle, Circle, Cpu, Shield, Zap, Globe, Lock, Search } from 'lucide-react';
import { useStore } from '../../context/StoreContext';

interface Module {
    id: string;
    name: string;
    description: string;
    category: 'core' | 'security' | 'creative' | 'dev';
    version: string;
    size: string;
    installed: boolean;
    icon: any;
}

export function ModuleManager() {
    const { addThought, addNotification } = useStore();
    const [installing, setInstalling] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [modules, setModules] = useState<Module[]>([
        { id: 'vis-core', name: 'Vision Core v2', description: 'Advanced image recognition and OCR capabilities.', category: 'core', version: '2.1.0', size: '1.2GB', installed: true, icon: EyeIcon },
        { id: 'py-interp', name: 'Python Runtime', description: 'Sandboxed Python execution environment for DevArch.', category: 'dev', version: '3.11.4', size: '450MB', installed: true, icon: TerminalIcon },
        { id: 'stable-diff', name: 'Creative Engine', description: 'Generative image synthesis subsystem.', category: 'creative', version: '1.5.0', size: '4.0GB', installed: false, icon: PaletteIcon },
        { id: 'net-sec', name: 'NetSec Guard', description: 'Deep packet inspection and firewall ruleset.', category: 'security', version: '1.0.2', size: '120MB', installed: false, icon: Shield },
        { id: 'web-crawl', name: 'Spider Node', description: 'Distributed web scraping and indexing agent.', category: 'dev', version: '0.9.5', size: '85MB', installed: false, icon: Globe },
        { id: 'crypto-wallet', name: 'Chain Link', description: 'Blockchain interaction and wallet management.', category: 'core', version: '1.0.0', size: '60MB', installed: false, icon: LinkIcon },
    ]);

    const handleInstall = (id: string) => {
        setInstalling(id);
        const module = modules.find(m => m.id === id);
        
        // Simulate Install
        addThought({
            id: Date.now().toString(),
            timestamp: new Date(),
            type: 'action',
            component: 'scheduler',
            content: `PackageManager: Initiating download for ${module?.name}...`
        });

        setTimeout(() => {
            setModules(prev => prev.map(m => m.id === id ? { ...m, installed: true } : m));
            setInstalling(null);
            addNotification({
                title: 'Module Installed',
                message: `${module?.name} is now active.`,
                type: 'success'
            });
        }, 2500);
    };

    const filteredModules = modules.filter(m => 
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        m.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-background/50 font-sans">
            {/* Header */}
            <div className="h-14 border-b border-border/50 flex items-center justify-between px-6 bg-card/10 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <Package className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="font-bold text-sm">Neural Modules</h2>
                        <p className="text-[10px] text-muted-foreground">System Capabilities Manager</p>
                    </div>
                </div>
                <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search modules..."
                        className="h-8 pl-8 pr-3 bg-muted/30 border border-border/30 rounded-lg text-xs focus:outline-none focus:border-primary w-48"
                    />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredModules.map((module) => (
                        <div key={module.id} className="group p-4 rounded-xl border border-border/50 bg-card/40 hover:bg-card/60 transition-all hover:shadow-lg hover:border-primary/20 flex flex-col gap-4">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-3">
                                    <div className={`p-3 rounded-xl ${module.installed ? 'bg-green-500/10 text-green-500' : 'bg-muted/50 text-muted-foreground'}`}>
                                        <module.icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-sm text-foreground">{module.name}</h3>
                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                            <span className="uppercase tracking-wider font-medium">{module.category}</span>
                                            <span>•</span>
                                            <span>v{module.version}</span>
                                        </div>
                                    </div>
                                </div>
                                {module.installed ? (
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-1 rounded-full">
                                        <CheckCircle className="w-3 h-3" />
                                        INSTALLED
                                    </div>
                                ) : installing === module.id ? (
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-full">
                                        <Circle className="w-3 h-3 animate-pulse fill-primary" />
                                        INSTALLING
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => handleInstall(module.id)}
                                        className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                {module.description}
                            </p>

                            <div className="mt-auto pt-3 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground">
                                <span className="font-mono">{module.size}</span>
                                <span className="flex items-center gap-1">
                                    <Shield className="w-3 h-3" /> Verified
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Icons
function EyeIcon(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg> }
function TerminalIcon(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg> }
function PaletteIcon(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg> }
function LinkIcon(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> }
