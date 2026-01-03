import React, { ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Nexus OS Kernel Panic:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen w-screen bg-black text-white p-6 font-mono relative overflow-hidden z-[9999]">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,0,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,0,0,0.05)_1px,transparent_1px)] bg-[size:20px_20px]" />
          
          <div className="relative z-10 max-w-md w-full bg-zinc-900 border border-red-900/50 rounded-lg shadow-2xl p-6 text-center">
            <div className="mx-auto w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20 animate-pulse">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                </svg>
            </div>
            
            <h2 className="text-xl font-bold text-red-500 mb-2 tracking-widest uppercase">System Failure</h2>
            <p className="text-zinc-400 text-xs mb-6 leading-relaxed">
              The Nexus interface encountered a critical runtime exception. 
              Diagnostic data has been logged.
            </p>

            <div className="bg-black/50 rounded p-3 mb-6 border border-zinc-800 text-left overflow-auto max-h-32">
                <code className="text-[10px] text-red-400 break-all">
                    {this.state.error?.message || 'Unknown Error'}
                </code>
            </div>

            <button 
              onClick={() => window.location.reload()}
              className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
              Reboot System
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}