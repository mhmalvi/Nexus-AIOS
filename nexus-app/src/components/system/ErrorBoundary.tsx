import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
    children: React.ReactNode;
    windowId?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class WindowErrorBoundary extends React.Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error(`[WindowErrorBoundary] ${this.props.windowId ?? "unknown"} crashed:`, error, info.componentStack);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                    <AlertTriangle className="w-10 h-10 text-destructive opacity-60" />
                    <div>
                        <p className="text-sm font-medium text-foreground/80">This window encountered an error</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-[320px] truncate">
                            {this.state.error?.message || "Unknown error"}
                        </p>
                    </div>
                    <button
                        onClick={this.handleReset}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                    >
                        <RotateCcw className="w-3 h-3" />
                        Reload
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
