import React, { useState } from "react";
import { AlertTriangle, CheckCircle, XCircle, FileCode, Terminal, ShieldAlert } from "lucide-react";
import { Button } from "../ui/Button";

interface ActionRequest {
    id: string;
    type: string;
    command: string;
    reasoning: string;
    tool: string;
    parameters: Record<string, any>;
    riskLevel: 'low' | 'medium' | 'high';
}

interface HILModalProps {
  open: boolean;
  onClose: () => void;
  onApprove: (action: ActionRequest) => void;
  onDeny: () => void;
  action: ActionRequest | null;
}

export function HILModal({
  open,
  onClose,
  onApprove,
  onDeny,
  action
}: HILModalProps) {
  const [customCommand, setCustomCommand] = useState(action?.command || "");
  
  // Update state when action changes
  React.useEffect(() => {
    if (action) setCustomCommand(action.command);
  }, [action]);

  if (!open || !action) return null;

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'high': return 'text-destructive border-destructive/30 bg-destructive/10';
      case 'medium': return 'text-yellow-500 border-yellow-500/30 bg-yellow-500/10';
      case 'low': return 'text-green-500 border-green-500/30 bg-green-500/10';
      default: return 'text-muted-foreground border-border';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-card border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b bg-muted/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500/20 rounded-full">
              <ShieldAlert className="w-6 h-6 text-yellow-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Action Approval Required</h2>
              <p className="text-sm text-muted-foreground">Nexus agent requires permission to proceed.</p>
            </div>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Risk Level */}
          <div className={`p-4 rounded-lg border flex items-center gap-3 ${getRiskColor(action.riskLevel)}`}>
            <AlertTriangle className="w-5 h-5" />
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-wider opacity-80">Risk Assessment</span>
              <span className="font-semibold capitalize">{action.riskLevel} Risk Operation</span>
            </div>
          </div>
          
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tool Context</h4>
                <div className="flex items-center gap-2 p-3 bg-muted/30 rounded border">
                  {action.tool === 'shell' ? <Terminal className="w-4 h-4" /> : <FileCode className="w-4 h-4" />}
                  <code className="text-sm font-semibold">{action.tool}</code>
                </div>
              </div>
              
               <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Reasoning</h4>
                <div className="p-3 bg-muted/30 rounded border min-h-[80px]">
                  <p className="text-sm leading-relaxed">{action.reasoning}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Command Execution</h4>
                <div className="relative">
                  <textarea
                    value={customCommand}
                    onChange={(e) => setCustomCommand(e.target.value)}
                    className="w-full bg-black/40 border rounded p-3 font-mono text-sm resize-none h-[180px] focus:outline-none focus:ring-1 focus:ring-primary"
                    spellCheck={false}
                  />
                  <div className="absolute bottom-2 right-2 text-[10px] text-muted-foreground">
                    Editable
                  </div>
                </div>
              </div>
            </div>
          </div>

          {action.parameters && Object.keys(action.parameters).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Parameters</h4>
              <div className="p-3 bg-muted/30 rounded border overflow-x-auto">
                <pre className="text-xs font-mono">{JSON.stringify(action.parameters, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
        
        <div className="p-6 border-t bg-muted/10 flex items-center justify-between">
          <div className="text-xs text-muted-foreground max-w-[200px]">
            Action ID: <span className="font-mono">{action.id}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onDeny} className="gap-2">
              <XCircle className="w-4 h-4" />
              Deny Action
            </Button>
            <Button onClick={() => onApprove({...action, command: customCommand})} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
              <CheckCircle className="w-4 h-4" />
              Approve & Execute
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}