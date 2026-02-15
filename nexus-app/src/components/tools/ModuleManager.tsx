
import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event'; // Added import
import { Package, Download, Check, AlertCircle, Settings, Search, RefreshCw, Loader2, ExternalLink, Trash2, Shield, CheckCircle, X, BookOpen, Sliders, Info, Cpu, HardDrive } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { kernelApi } from '../../services/tauriApi';
import { motion, AnimatePresence } from 'framer-motion';

interface Module {
    id: string;
    name: string;
    description: string;
    version: string;
    icon: '🧠' | '🔍' | '🛡️' | '📊' | '🛠️' | '🔮' | '📝' | '🌐';
    isInstalled: boolean;
    size?: string;
    isLoading?: boolean;
    category?: string;
    capabilities?: string[];
    contextLength?: number;
    temperature?: number;
    systemPrompt?: string;
}

interface ModuleConfig {
    temperature: number;
    contextLength: number;
    systemPrompt: string;
}

export function ModuleManager() {
    const { addNotification, addThought } = useStore();
    const [modules, setModules] = useState<Module[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<'all' | 'installed' | 'available'>('all');

    // Modal states
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [showDocsModal, setShowDocsModal] = useState(false);
    const [selectedModule, setSelectedModule] = useState<Module | null>(null);
    const [showUninstallConfirm, setShowUninstallConfirm] = useState<string | null>(null);
    const [installProgress, setInstallProgress] = useState<Record<string, number>>({});

    // Config form
    const [configForm, setConfigForm] = useState<ModuleConfig>({
        temperature: 0.7,
        contextLength: 4096,
        systemPrompt: ''
    });

    // Fetch real models from Ollama via kernel API
    useEffect(() => {
        fetchModules();

        // Listen for download progress
        const unlistenProgress = listen('effect://event', (event: any) => {
            const payload = event.payload?.data?.payload;
            const eventType = event.payload?.data?.event;

            if (eventType === 'model_download_progress' && payload) {
                const { model, total, completed } = payload;
                if (total && completed) {
                    const percent = Math.round((completed / total) * 100);
                    setInstallProgress(prev => ({ ...prev, [model]: percent }));
                }
            } else if (eventType === 'model_download_complete' && payload) {
                const { model, success, error } = payload;

                setModules(prev => prev.map(m =>
                    m.id === model ? { ...m, isInstalled: success, isLoading: false } : m
                ));

                // Clear progress
                setInstallProgress(prev => {
                    const { [model]: _, ...rest } = prev;
                    return rest;
                });

                if (success) {
                    addNotification({ type: 'success', title: 'Install Complete', message: `${model} is ready.` });
                } else {
                    addNotification({ type: 'error', title: 'Install Failed', message: error || 'Unknown error' });
                }
            }
        });

        return () => {
            unlistenProgress.then(f => f());
        };
    }, []);

    const fetchModules = async () => {
        setLoading(true);
        try {
            const stats = await kernelApi.getModelStats();

            const availableModels: Module[] = [
                {
                    id: 'llama3.2:latest',
                    name: 'LLaMA 3.2',
                    description: 'Meta AI reasoning model with advanced comprehension and instruction following',
                    version: '3.2B',
                    icon: '🧠',
                    isInstalled: false,
                    size: '2.0 GB',
                    category: 'core',
                    capabilities: ['General reasoning', 'Code generation', 'Instruction following', 'Multi-language'],
                    contextLength: 8192,
                    temperature: 0.7
                },
                {
                    id: 'gemma2:2b',
                    name: 'Gemma 2',
                    description: 'Google lightweight model optimized for edge deployment and fast inference',
                    version: '2B',
                    icon: '🔮',
                    isInstalled: false,
                    size: '1.6 GB',
                    category: 'core',
                    capabilities: ['Fast inference', 'Edge optimized', 'Low memory', 'General tasks'],
                    contextLength: 4096,
                    temperature: 0.7
                },
                {
                    id: 'qwen2.5-coder:7b',
                    name: 'Qwen Coder',
                    description: 'Alibaba code-optimized model with superior programming capabilities',
                    version: '7B',
                    icon: '🛠️',
                    isInstalled: false,
                    size: '4.7 GB',
                    category: 'dev',
                    capabilities: ['Code completion', 'Debugging', 'Code review', 'Documentation'],
                    contextLength: 32768,
                    temperature: 0.3
                },
                {
                    id: 'mistral:7b',
                    name: 'Mistral',
                    description: 'Mistral AI high quality general model with excellent reasoning',
                    version: '7B',
                    icon: '🌐',
                    isInstalled: false,
                    size: '4.1 GB',
                    category: 'core',
                    capabilities: ['General reasoning', 'Analysis', 'Creative writing', 'Summarization'],
                    contextLength: 8192,
                    temperature: 0.7
                },
                {
                    id: 'deepseek-coder:6.7b',
                    name: 'DeepSeek Coder',
                    description: 'Specialized coding assistant trained on vast code repositories',
                    version: '6.7B',
                    icon: '📝',
                    isInstalled: false,
                    size: '3.8 GB',
                    category: 'dev',
                    capabilities: ['Code generation', 'Refactoring', 'Bug fixing', 'Unit tests'],
                    contextLength: 16384,
                    temperature: 0.2
                },
                {
                    id: 'phi3:mini',
                    name: 'Phi-3 Mini',
                    description: 'Microsoft small but capable model optimized for reasoning tasks',
                    version: '3.8B',
                    icon: '📊',
                    isInstalled: false,
                    size: '2.3 GB',
                    category: 'core',
                    capabilities: ['Reasoning', 'Math', 'Logic', 'Compact size'],
                    contextLength: 4096,
                    temperature: 0.7
                },
                {
                    id: 'nomic-embed-text',
                    name: 'Nomic Embed',
                    description: 'High performance text embeddings for semantic search and RAG',
                    version: '1.0',
                    icon: '🔍',
                    isInstalled: false,
                    size: '274 MB',
                    category: 'search',
                    capabilities: ['Text embeddings', 'Semantic search', 'RAG support', 'Fast inference'],
                    contextLength: 8192,
                    temperature: 0
                },
                {
                    id: 'llava:7b',
                    name: 'LLaVA Vision',
                    description: 'Multimodal vision-language model for image understanding',
                    version: '7B',
                    icon: '🛡️',
                    isInstalled: false,
                    size: '4.5 GB',
                    category: 'creative',
                    capabilities: ['Image analysis', 'Visual QA', 'Image description', 'OCR'],
                    contextLength: 4096,
                    temperature: 0.7
                },
            ];

            // Mark installed models
            if (stats.default_model) {
                const defaultModelBase = stats.default_model.split(':')[0].toLowerCase();
                availableModels.forEach(m => {
                    const moduleBase = m.id.split(':')[0].toLowerCase();
                    if (moduleBase === defaultModelBase || m.id === stats.default_model) {
                        m.isInstalled = true;
                    }
                });
            }

            if (stats.installed_models) {
                stats.installed_models.forEach((modelName: string) => {
                    const modelBase = modelName.split(':')[0].toLowerCase();
                    availableModels.forEach(m => {
                        if (m.id.toLowerCase().includes(modelBase)) {
                            m.isInstalled = true;
                        }
                    });
                });
            }

            setModules(availableModels);
        } catch (error) {
            console.error('Failed to fetch modules:', error);
            // Keep current modules on error
        } finally {
            setLoading(false);
        }
    };

    const handleInstall = async (module: Module) => {
        setModules(prev => prev.map(m =>
            m.id === module.id ? { ...m, isLoading: true } : m
        ));
        setInstallProgress(prev => ({ ...prev, [module.id]: 0 }));

        addThought({
            id: Date.now().toString(),
            timestamp: new Date(),
            type: 'action',
            component: 'modules',
            content: `Module Manager: Initiating download of ${module.name} (${module.id})...`
        });

        try {
            // Trigger background pull
            const response = await kernelApi.manageModel('pull', module.id);

            if (response.success) {
                addNotification({
                    type: 'info',
                    title: 'Download Started',
                    message: `Pulling ${module.name} from Ollama registry...`
                });
            } else {
                throw new Error(response.message || 'Failed to start download');
            }
        } catch (error) {
            setModules(prev => prev.map(m =>
                m.id === module.id ? { ...m, isLoading: false } : m
            ));

            setInstallProgress(prev => {
                const { [module.id]: _, ...rest } = prev;
                return rest;
            });

            addNotification({
                type: 'error',
                title: 'Installation Failed',
                message: `Failed to install ${module.name}. Check connection.`
            });
        }
    };

    const handleUninstall = async (module: Module) => {
        setShowUninstallConfirm(null);
        setModules(prev => prev.map(m =>
            m.id === module.id ? { ...m, isLoading: true } : m
        ));

        addThought({
            id: Date.now().toString(),
            timestamp: new Date(),
            type: 'action',
            component: 'modules',
            content: `Module Manager: Removing ${module.name}...`
        });

        try {
            const response = await kernelApi.manageModel('delete', module.id);

            if (response.success) {
                setModules(prev => prev.map(m =>
                    m.id === module.id ? { ...m, isInstalled: false, isLoading: false } : m
                ));

                addNotification({
                    type: 'info',
                    title: 'Module Removed',
                    message: `${module.name} has been uninstalled.`
                });
            } else {
                throw new Error(response.message || 'Delete failed');
            }
        } catch (error) {
            setModules(prev => prev.map(m =>
                m.id === module.id ? { ...m, isLoading: false } : m
            ));

            addNotification({
                type: 'error',
                title: 'Removal Failed',
                message: `Failed to remove ${module.name}.`
            });
        }
    };

    const handleOpenConfig = (module: Module) => {
        setSelectedModule(module);
        setConfigForm({
            temperature: module.temperature || 0.7,
            contextLength: module.contextLength || 4096,
            systemPrompt: module.systemPrompt || ''
        });
        setShowConfigModal(true);
    };

    const handleSaveConfig = () => {
        if (!selectedModule) return;

        setModules(prev => prev.map(m =>
            m.id === selectedModule.id ? {
                ...m,
                temperature: configForm.temperature,
                contextLength: configForm.contextLength,
                systemPrompt: configForm.systemPrompt
            } : m
        ));

        addNotification({
            type: 'success',
            title: 'Configuration Saved',
            message: `${selectedModule.name} settings updated.`
        });

        setShowConfigModal(false);
        setSelectedModule(null);
    };

    const handleOpenDocs = (module: Module) => {
        setSelectedModule(module);
        setShowDocsModal(true);
    };

    const filteredModules = modules.filter(m => {
        const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = filter === 'all' ||
            (filter === 'installed' && m.isInstalled) ||
            (filter === 'available' && !m.isInstalled);
        return matchesSearch && matchesFilter;
    });

    const installedCount = modules.filter(m => m.isInstalled).length;
    const availableCount = modules.filter(m => !m.isInstalled).length;

    return (
        <div className="h-full flex flex-col bg-background font-sans">
            {/* Header */}
            <div className="bg-muted/20 border-b border-border p-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <Package className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="font-bold text-sm">Neural Modules</h2>
                            <p className="text-[10px] text-muted-foreground">Ollama Model Manager</p>
                        </div>
                    </div>
                    <button
                        onClick={fetchModules}
                        className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground"
                        disabled={loading}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {/* Search and Filter */}
                <div className="flex gap-3">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search modules..."
                            className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary"
                        />
                    </div>
                    <div className="flex gap-1 bg-card rounded-lg p-1 border border-border">
                        <button
                            onClick={() => setFilter('all')}
                            className={`px-3 py-1 rounded text-xs transition-all ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                        >
                            All ({modules.length})
                        </button>
                        <button
                            onClick={() => setFilter('installed')}
                            className={`px-3 py-1 rounded text-xs transition-all ${filter === 'installed' ? 'bg-green-500 text-white' : 'hover:bg-muted'}`}
                        >
                            Installed ({installedCount})
                        </button>
                        <button
                            onClick={() => setFilter('available')}
                            className={`px-3 py-1 rounded text-xs transition-all ${filter === 'available' ? 'bg-blue-500 text-white' : 'hover:bg-muted'}`}
                        >
                            Available ({availableCount})
                        </button>
                    </div>
                </div>
            </div>

            {/* Module Grid */}
            <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <AnimatePresence>
                            {filteredModules.map(module => (
                                <motion.div
                                    key={module.id}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className={`relative p-4 rounded-xl border transition-all hover:shadow-lg group ${module.isInstalled
                                        ? 'bg-green-500/5 border-green-500/30 hover:border-green-500/50'
                                        : 'bg-card border-border hover:border-primary/30'
                                        }`}
                                >
                                    {/* Status Badge */}
                                    {module.isInstalled && (
                                        <div className="absolute top-3 right-3 flex items-center gap-1.5 text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-1 rounded-full">
                                            <CheckCircle className="w-3 h-3" />
                                            INSTALLED
                                        </div>
                                    )}

                                    <div className="flex items-start gap-3 mb-3">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl border ${module.isInstalled ? 'bg-green-500/10 border-green-500/20' : 'bg-muted/30 border-border/50'}`}>
                                            {module.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-foreground truncate">{module.name}</h3>
                                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                                <span className="uppercase tracking-wider font-medium">{module.category}</span>
                                                <span>•</span>
                                                <span>v{module.version}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                                        {module.description}
                                    </p>

                                    {/* Capabilities */}
                                    {module.capabilities && (
                                        <div className="flex flex-wrap gap-1 mb-3">
                                            {module.capabilities.slice(0, 3).map((cap, i) => (
                                                <span key={i} className="text-[9px] px-2 py-0.5 bg-muted/50 rounded-full text-muted-foreground">
                                                    {cap}
                                                </span>
                                            ))}
                                            {module.capabilities.length > 3 && (
                                                <span className="text-[9px] px-2 py-0.5 bg-muted/50 rounded-full text-muted-foreground">
                                                    +{module.capabilities.length - 3}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Progress Bar */}
                                    {installProgress[module.id] !== undefined && (
                                        <div className="mb-3">
                                            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                                                <span>Downloading...</span>
                                                <span>{installProgress[module.id]}%</span>
                                            </div>
                                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                                <motion.div
                                                    className="h-full bg-primary"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${installProgress[module.id]}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between pt-3 border-t border-border/30">
                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                            <span className="font-mono flex items-center gap-1">
                                                <HardDrive className="w-3 h-3" /> {module.size}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Shield className="w-3 h-3" /> Verified
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1">
                                            {module.isInstalled ? (
                                                <>
                                                    <button
                                                        onClick={() => handleOpenDocs(module)}
                                                        className="p-1.5 hover:bg-muted rounded text-muted-foreground"
                                                        title="Documentation"
                                                    >
                                                        <BookOpen className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleOpenConfig(module)}
                                                        className="p-1.5 hover:bg-muted rounded text-muted-foreground"
                                                        title="Configure"
                                                    >
                                                        <Settings className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => setShowUninstallConfirm(module.id)}
                                                        className="p-1.5 hover:bg-red-500/20 text-red-500 rounded"
                                                        title="Uninstall"
                                                        disabled={module.isLoading}
                                                    >
                                                        {module.isLoading ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        )}
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => !module.isLoading && handleInstall(module)}
                                                    disabled={module.isLoading}
                                                    className={`flex items-center gap-1.5 text-xs font-medium transition-all ${module.isLoading
                                                        ? 'text-primary cursor-wait'
                                                        : 'text-primary hover:text-primary/80'
                                                        }`}
                                                >
                                                    {module.isLoading ? (
                                                        <>
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            Installing...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Download className="w-3.5 h-3.5" />
                                                            Install
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Uninstall Confirmation */}
                                    <AnimatePresence>
                                        {showUninstallConfirm === module.id && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg"
                                            >
                                                <p className="text-xs text-red-500 mb-2">Remove {module.name}? This will delete the model files.</p>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setShowUninstallConfirm(null)}
                                                        className="flex-1 px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        onClick={() => handleUninstall(module)}
                                                        className="flex-1 px-3 py-1.5 text-xs bg-red-500 text-white hover:bg-red-600 rounded"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}

                {!loading && filteredModules.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <Package className="w-12 h-12 mb-4 opacity-20" />
                        <p>No modules found matching your criteria.</p>
                    </div>
                )}
            </div>

            {/* Footer Info */}
            <div className="bg-muted/20 border-t border-border p-3 flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                    <span>Ollama Registry</span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                    <span>{installedCount} installed</span>
                </div>
                <a href="https://ollama.ai/library" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary">
                    Browse Library <ExternalLink className="w-3 h-3" />
                </a>
            </div>

            {/* Configuration Modal */}
            <AnimatePresence>
                {showConfigModal && selectedModule && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
                        onClick={() => setShowConfigModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-4 border-b border-border flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Sliders className="w-4 h-4 text-primary" />
                                    <h3 className="font-bold">Configure {selectedModule.name}</h3>
                                </div>
                                <button onClick={() => setShowConfigModal(false)} className="p-1 hover:bg-muted rounded">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="p-4 space-y-4">
                                <div>
                                    <label className="text-xs text-muted-foreground block mb-2">
                                        Temperature: {configForm.temperature.toFixed(1)}
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="2"
                                        step="0.1"
                                        value={configForm.temperature}
                                        onChange={e => setConfigForm(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                                        className="w-full"
                                    />
                                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                                        <span>Precise</span>
                                        <span>Creative</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs text-muted-foreground block mb-2">
                                        Context Length: {configForm.contextLength.toLocaleString()} tokens
                                    </label>
                                    <input
                                        type="range"
                                        min="1024"
                                        max="32768"
                                        step="1024"
                                        value={configForm.contextLength}
                                        onChange={e => setConfigForm(prev => ({ ...prev, contextLength: parseInt(e.target.value) }))}
                                        className="w-full"
                                    />
                                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                                        <span>1K</span>
                                        <span>32K</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs text-muted-foreground block mb-1">System Prompt</label>
                                    <textarea
                                        value={configForm.systemPrompt}
                                        onChange={e => setConfigForm(prev => ({ ...prev, systemPrompt: e.target.value }))}
                                        placeholder="Optional: Custom system prompt for this model..."
                                        rows={3}
                                        className="w-full px-3 py-2 bg-muted/30 border border-border rounded-lg text-sm focus:outline-none focus:border-primary resize-none"
                                    />
                                </div>
                            </div>

                            <div className="p-4 border-t border-border flex justify-end gap-2">
                                <button
                                    onClick={() => setShowConfigModal(false)}
                                    className="px-4 py-2 text-sm hover:bg-muted rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveConfig}
                                    className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90"
                                >
                                    Save Configuration
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Documentation Modal */}
            <AnimatePresence>
                {showDocsModal && selectedModule && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
                        onClick={() => setShowDocsModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-4 border-b border-border flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <BookOpen className="w-4 h-4 text-primary" />
                                    <h3 className="font-bold">{selectedModule.name} Documentation</h3>
                                </div>
                                <button onClick={() => setShowDocsModal(false)} className="p-1 hover:bg-muted rounded">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                                <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg">
                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-muted/30">
                                        {selectedModule.icon}
                                    </div>
                                    <div>
                                        <h4 className="font-bold">{selectedModule.name}</h4>
                                        <p className="text-xs text-muted-foreground">v{selectedModule.version} • {selectedModule.category}</p>
                                    </div>
                                </div>

                                <div>
                                    <h5 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Description</h5>
                                    <p className="text-sm">{selectedModule.description}</p>
                                </div>

                                <div>
                                    <h5 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Capabilities</h5>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedModule.capabilities?.map((cap, i) => (
                                            <span key={i} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                                                {cap}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 bg-muted/20 rounded-lg">
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                            <Cpu className="w-3 h-3" /> Context Length
                                        </div>
                                        <div className="font-bold">{(selectedModule.contextLength || 4096).toLocaleString()} tokens</div>
                                    </div>
                                    <div className="p-3 bg-muted/20 rounded-lg">
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                            <HardDrive className="w-3 h-3" /> Model Size
                                        </div>
                                        <div className="font-bold">{selectedModule.size}</div>
                                    </div>
                                </div>

                                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                                    <div className="flex items-start gap-2">
                                        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                        <p className="text-xs text-blue-800 dark:text-blue-200">
                                            This model is managed by Ollama. For detailed documentation, visit the Ollama model library.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 border-t border-border flex justify-end">
                                <button
                                    onClick={() => setShowDocsModal(false)}
                                    className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg text-sm"
                                >
                                    Close
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
