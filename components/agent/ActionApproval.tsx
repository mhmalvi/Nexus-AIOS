
import React, { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle, XCircle, FileCode, Terminal, ShieldAlert, Zap } from "lucide-react";
import { Button } from "../ui/Button";
import { motion, AnimatePresence } from "framer-motion";

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
  const [scanState, setScanState] = useState<'scanning' | 'verified' | 'danger'>('scanning');
  
  // Update state when action changes
  useEffect(() => {
    if (action) {
        setCustomCommand(action.command);
        setScanState('scanning');
        
        // Simulate audit completion
        const timer = setTimeout(() => {
            setScanState(action.riskLevel === 'high' ? 'danger' : 'verified');
        }, 2000);
        return () => clearTimeout(timer);
    }
  }, [action]);

  if (!open || !action) return null;

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'high': return 'text-destructive border-destructive/30 bg-destructive/10';
      case 'medium': return 'text-nexus-alert border-nexus-alert/30 bg-nexus-alert/10';
      case 'low': return 'text-nexus-tool border-nexus-tool/30 bg-nexus-tool/10';
      default: return 'text-muted-foreground border-border';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl glass-panel rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white/10 relative">
        
        {/* Supervisor Audit Visual Effect */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl z-0">
             <AnimatePresence>
                 {scanState === 'scanning' && (
                     <motion.div 
                        initial={{ top: 0, opacity: 0 }}
                        animate={{ top: '100%', opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 2, ease: "linear", repeat: Infinity }}
                        className="absolute left-0 w-full h-1 bg-red-500/80 shadow-[0_0_15px_rgba(255,0,0,0.6)]"
                     />
                 )}
                 {scanState === 'verified' && (
                     <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 0.2, 0] }}
                        transition={{ duration: 1 }}
                        className="absolute inset-0 bg-green-500"
                     />
                 )}
                 {scanState === 'danger' && (
                     <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 0.2, 0] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="absolute inset-0 bg-red-600"
                     />
                 )}
             </AnimatePresence>
        </div>

        {/* Header */}
        <div className="p-6 border-b border-white/5 bg-white/5 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="relative">
                {scanState === 'danger' && <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping opacity-50"></div>}
                <div className={`relative p-2 rounded-full border transition-colors duration-500
                    ${scanState === 'verified' ? 'bg-nexus-tool/20 border-nexus-tool/50' : 
                      scanState === 'danger' ? 'bg-destructive/20 border-destructive/50' : 
                      'bg-nexus-alert/20 border-nexus-alert/30'}`}>
                     <ShieldAlert className={`w-6 h-6 
                        ${scanState === 'verified' ? 'text-nexus-tool' : 
                          scanState === 'danger' ? 'text-destructive' : 
                          'text-nexus-alert'}`} />
                </div>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide glow-text">Human-in-the-Loop Protocol</h2>
              <p className="text-sm text-zinc-400">
                  {scanState === 'scanning' ? 'Agent paused. Auditing command safety...' : 
                   scanState === 'verified' ? 'Audit Complete. Safe to execute.' : 
                   'Audit Warning. High risk detected.'}
              </p>
            </div>
          </div>
          
          {(action.riskLevel === 'low' || scanState === 'verified') && (
              <Button onClick={() => onApprove({...action, command: customCommand})} className="bg-nexus-tool/20 hover:bg-nexus-tool/30 text-nexus-tool border border-nexus-tool/50 gap-2">
                  <Zap className="w-4 h-4" />
                  Quick Approve
              </Button>
          )}
        </div>
        
        <div className="p-6 space-y-6 relative z-10">
          {/* Risk Level */}
          <div className={`p-4 rounded-xl border flex items-center gap-4 transition-colors duration-500 ${getRiskColor(action.riskLevel)}`}>
            <AlertTriangle className="w-6 h-6" />
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-wider opacity-80">Risk Assessment</span>
              <span className="font-semibold capitalize text-lg">{action.riskLevel} Risk Operation</span>
            </div>
          </div>
          
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Tool Context</h4>
                <div className="flex items-center gap-2 p-3 bg-black/40 rounded-lg border border-white/10">
                  {action.tool === 'shell' ? <Terminal className="w-4 h-4 text-nexus-brain" /> : <FileCode className="w-4 h-4 text-nexus-tool" />}
                  <code className="text-sm font-semibold text-white">{action.tool}</code>
                </div>
              </div>
              
               <div>
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Reasoning</h4>
                <div className="p-3 bg-black/40 rounded-lg border border-white/10 min-h-[80px]">
                  <p className="text-sm leading-relaxed text-zinc-300">{action.reasoning}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Command Execution</h4>
                <div className="relative group">
                  <div className={`absolute -inset-0.5 rounded-lg blur opacity-20 transition duration-1000
                        ${scanState === 'verified' ? 'bg-green-500 opacity-30' : 
                          scanState === 'danger' ? 'bg-red-500 opacity-40' : 
                          'bg-gradient-to-r from-nexus-brain to-nexus-memory group-hover:opacity-40'}`}></div>
                  <textarea
                    value={customCommand}
                    onChange={(e) => setCustomCommand(e.target.value)}
                    className="relative w-full bg-black border border-white/10 rounded-lg p-3 font-mono text-sm resize-none h-[180px] focus:outline-none focus:border-nexus-brain/50 text-nexus-tool"
                    spellCheck={false}
                  />
                  <div className="absolute bottom-2 right-2 text-[10px] text-zinc-600 font-mono bg-black/80 px-1 rounded">
                    READ-WRITE
                  </div>
                </div>
              </div>
            </div>
          </div>

          {action.parameters && Object.keys(action.parameters).length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Parameters</h4>
              <div className="p-3 bg-black/40 rounded-lg border border-white/10 overflow-x-auto">
                <pre className="text-xs font-mono text-zinc-400">{JSON.stringify(action.parameters, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
        
        <div className="p-6 border-t border-white/5 bg-white/5 flex items-center justify-between relative z-10">
          <div className="text-xs text-zinc-600 max-w-[200px] font-mono">
            ID: {action.id}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onDeny} className="gap-2 border-white/10 hover:bg-red-950/30 hover:text-red-400 hover:border-red-900">
              <XCircle className="w-4 h-4" />
              Deny Action
            </Button>
            <Button onClick={() => onApprove({...action, command: customCommand})} className="gap-2 bg-nexus-tool hover:bg-nexus-tool/90 text-black font-bold shadow-[0_0_20px_rgba(50,215,75,0.4)] border-none">
              <CheckCircle className="w-4 h-4" />
              Approve & Execute
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
    