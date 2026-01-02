import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Terminal, Activity } from "lucide-react";
import { Button } from "./Button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Nexus OS Kernel Panic:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen w-full bg-black text-foreground p-6 font-mono relative overflow-hidden">
          {/* Background Grid */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#333_1px,transparent_1px),linear-gradient(to_bottom,#333_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 pointer-events-none" />
          
          <div className="relative z-10 max-w-2xl w-full bg-zinc-950/90 border border-red-900/50 rounded-lg shadow-2xl overflow-hidden backdrop-blur-xl animate-in zoom-in duration-300">
            {/* Header */}
            <div className="bg-red-950/30 border-b border-red-900/30 px-6 py-4 flex items-center justify-between">
               <div className="flex items-center gap-3">
                 <Terminal className="w-5 h-5 text-red-500" />
                 <h2 className="text-lg font-bold text-red-100 tracking-wider">KERNEL_PANIC</h2>
               </div>
               <div className="flex gap-2">
                 <div className="w-3 h-3 rounded-full bg-red-500/50" />
                 <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                 <div className="w-3 h-3 rounded-full bg-green-500/50" />
               </div>
            </div>

            {/* Content */}
            <div className="p-8 space-y-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                   <Activity className="w-8 h-8 text-red-500" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-medium text-red-50">Runtime Exception Detected</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    The Nexus interface encountered a critical error during the render cycle. 
                    System integrity has been compromised. Automatic recovery failed.
                  </p>
                </div>
              </div>

              {/* Error Code Block */}
              <div className="bg-black/50 border border-zinc-800 rounded-md p-4 font-mono text-xs overflow-x-auto">
                 <div className="flex items-center gap-2 mb-2 text-zinc-500 border-b border-zinc-800 pb-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    STACK_TRACE_DUMP
                 </div>
                 <pre className="text-red-400">
                   {this.state.error?.message || 'Unknown Error'}
                 </pre>
                 {this.state.errorInfo && (
                   <pre className="text-zinc-500 mt-2 opacity-50">
                     {this.state.errorInfo.componentStack}
                   </pre>
                 )}
              </div>
            </div>

            {/* Actions */}
            <div className="bg-zinc-900/50 border-t border-zinc-800 px-6 py-4 flex justify-between items-center">
              <div className="text-[10px] text-zinc-600 uppercase tracking-widest">
                Error Code: 0x525_REACT_MINIFIED
              </div>
              <Button 
                onClick={() => window.location.reload()}
                className="bg-red-600 hover:bg-red-700 text-white border-none shadow-lg shadow-red-900/20 gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reboot Interface
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}