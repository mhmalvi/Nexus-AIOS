import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Bot, Check, Download, HardDrive, RefreshCw, X } from 'lucide-react';

interface OllamaStatus {
    installed: boolean;
    running: boolean;
    version?: string;
    models: string[];
}

interface DownloadProgress {
    stage: string;
    progress: number;
    message: string;
}

interface OllamaSetupProps {
    onComplete: () => void;
    onSkip?: () => void;
}

export const ProviderSetup: React.FC<OllamaSetupProps> = ({ onComplete, onSkip }) => {
    const [step, setStep] = useState<'check' | 'install' | 'model' | 'complete'>('check');
    const [status, setStatus] = useState<OllamaStatus | null>(null);
    const [progress, setProgress] = useState<DownloadProgress | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isChecking, setIsChecking] = useState(false);

    useEffect(() => {
        checkStatus();

        const unlistenDownload = listen<DownloadProgress>('ollama_download_progress', (event) => {
            setProgress(event.payload);
        });

        const unlistenInstall = listen<DownloadProgress>('ollama_install_progress', (event) => {
            setProgress(event.payload);
        });

        const unlistenModel = listen<DownloadProgress>('ollama_model_progress', (event) => {
            setProgress(event.payload);
        });

        return () => {
            unlistenDownload.then(fn => fn());
            unlistenInstall.then(fn => fn());
            unlistenModel.then(fn => fn());
        };
    }, []);

    const checkStatus = async () => {
        setIsChecking(true);
        setError(null);
        try {
            const result = await invoke<OllamaStatus>('check_ollama_installed');
            setStatus(result);

            if (result.installed) {
                if (result.models.length > 0) {
                    // Already has models, we can probably skip or go to complete
                    setStep('complete');
                } else {
                    // Installed but no models
                    setStep('model');
                }
            }
        } catch (err) {
            setError(`Failed to check Ollama status: ${err}`);
        } finally {
            setIsChecking(false);
        }
    };

    const handleInstall = async () => {
        setError(null);
        setProgress({ stage: 'starting', progress: 0, message: 'Starting download...' });

        try {
            const installerPath = await invoke<string>('download_ollama');
            await invoke<boolean>('install_ollama', { installerPath });

            // Re-check status after install
            await checkStatus();
            setStep('model');
        } catch (err) {
            setError(`Installation failed: ${err}`);
            setProgress(null);
        }
    };

    const handlePullModel = async () => {
        setError(null);
        setProgress({ stage: 'starting', progress: 0, message: 'Preparing to pull model...' });

        try {
            // Ensure ollama is running first
            await invoke('start_ollama');

            // Pull default model
            const success = await invoke<boolean>('ensure_model', { modelName: 'llama3.2:3b' });

            if (success) {
                setStep('complete');
                // Refresh status to show new model
                checkStatus();
            } else {
                setError('Failed to pull model');
            }
        } catch (err) {
            setError(`Model pull failed: ${err}`);
        }
    };

    const renderStep = () => {
        switch (step) {
            case 'check':
                return (
                    <div className="space-y-6">
                        <div className="text-center space-y-2">
                            <div className="bg-blue-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-500/30">
                                <Bot className="w-8 h-8 text-blue-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-white">AI Engine Setup</h2>
                            <p className="text-white/60">
                                Nexus requires Ollama to run local AI models. Let's check your system.
                            </p>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-white/80">Ollama Installed</span>
                                {isChecking ? (
                                    <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
                                ) : status?.installed ? (
                                    <span className="flex items-center text-green-400 gap-2"><Check className="w-4 h-4" /> Detected ({status.version})</span>
                                ) : (
                                    <span className="flex items-center text-yellow-400 gap-2"><X className="w-4 h-4" /> Not Found</span>
                                )}
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-white/80">Service Status</span>
                                {isChecking ? (
                                    <span className="text-white/40">Checking...</span>
                                ) : status?.running ? (
                                    <span className="flex items-center text-green-400 gap-2"><Check className="w-4 h-4" /> Running</span>
                                ) : (
                                    <span className="text-white/40">Stopped</span>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-4">
                            {status?.installed ? (
                                <button
                                    onClick={() => setStep('model')}
                                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    Continue
                                </button>
                            ) : (
                                <button
                                    onClick={handleInstall}
                                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <Download className="w-5 h-5" />
                                    Install Ollama
                                </button>
                            )}
                            {onSkip && (
                                <button
                                    onClick={onSkip}
                                    className="px-6 py-3 text-white/40 hover:text-white transition-colors"
                                >
                                    Skip
                                </button>
                            )}
                        </div>
                    </div>
                );

            case 'install':
                return (
                    <div className="space-y-6 text-center">
                        <div className="relative w-20 h-20 mx-auto mb-4">
                            <svg className="w-full h-full transform -rotate-90">
                                <circle
                                    className="text-white/10"
                                    strokeWidth="4"
                                    stroke="currentColor"
                                    fill="transparent"
                                    r="36"
                                    cx="40"
                                    cy="40"
                                />
                                <circle
                                    className="text-blue-500 transition-all duration-300 ease-in-out"
                                    strokeWidth="4"
                                    strokeDasharray={226}
                                    strokeDashoffset={226 - ((progress?.progress || 0) / 100) * 226}
                                    strokeLinecap="round"
                                    stroke="currentColor"
                                    fill="transparent"
                                    r="36"
                                    cx="40"
                                    cy="40"
                                />
                            </svg>
                            <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center text-sm font-bold text-white">
                                {Math.round(progress?.progress || 0)}%
                            </div>
                        </div>

                        <div>
                            <h3 className="text-xl font-bold text-white mb-2">Installing AI Engine</h3>
                            <p className="text-white/60 mb-6">{progress?.message || "Please wait..."}</p>
                        </div>
                    </div>
                );

            case 'model':
                return (
                    <div className="space-y-6">
                        <div className="text-center space-y-2">
                            <div className="bg-purple-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-purple-500/30">
                                <HardDrive className="w-8 h-8 text-purple-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-white">Download Model</h2>
                            <p className="text-white/60">
                                Nexus needs a brain. We'll download Llama 3.2 (3B), optimized for speed and performance.
                            </p>
                        </div>

                        {progress && (
                            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-white/80">{progress.stage}</span>
                                    <span className="text-white/60">{Math.round(progress.progress)}%</span>
                                </div>
                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-purple-500 transition-all duration-300"
                                        style={{ width: `${progress.progress}%` }}
                                    />
                                </div>
                                <p className="text-xs text-white/40 mt-2 font-mono">{progress.message}</p>
                            </div>
                        )}

                        {error && (
                            <div className="bg-red-500/20 border border-red-500/30 p-4 rounded-lg text-red-200 text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handlePullModel}
                            disabled={!!progress}
                            className={`w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2 ${progress ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {progress ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                            {progress ? 'Downloading Model...' : 'Download Model (~2GB)'}
                        </button>

                        <button
                            onClick={() => setStep('complete')}
                            className="w-full py-2 text-white/40 hover:text-white transition-colors text-sm"
                        >
                            I have my own models
                        </button>
                    </div>
                );

            case 'complete':
                return (
                    <div className="text-center space-y-6">
                        <div className="bg-green-500/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-500/30 animate-pulse">
                            <Check className="w-10 h-10 text-green-400" />
                        </div>

                        <h2 className="text-2xl font-bold text-white">Setup Complete!</h2>
                        <p className="text-white/60">
                            Nexus AIOS is ready to run. The kernel is initialized and memory systems are online.
                        </p>

                        <button
                            onClick={onComplete}
                            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl transition-all hover:scale-[1.02] shadow-lg shadow-green-900/20"
                        >
                            Launch Nexus
                        </button>
                    </div>
                );
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-[#0f1115] border border-white/10 rounded-2xl w-full max-w-md p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

                <div className="relative z-10">
                    {renderStep()}
                </div>
            </div>
        </div>
    );
};
