import React, { useEffect, useState } from 'react';
import { useStore } from '../../context/StoreContext';
import { kernelBridge } from '../../services/kernelEventBridge';
import { Activity, Terminal, Cpu, Zap, CheckCircle2, Clock } from 'lucide-react';

interface TaskLog {
    id: string;
    timestamp: Date;
    agent: string;
    message: string;
    type: 'info' | 'success' | 'error' | 'warning';
}

export function AgentMonitor() {
    // const { swarm, thoughtStream } = useStore();
    const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
    const [activeTasks, setActiveTasks] = useState<Record<string, string>>({});

    useEffect(() => {
        // Subscribe to task updates
        const unsubTask = kernelBridge.onMessageType('task_result', (data) => {
            const agentId = data.data?.agent_id || 'system';
            const message = data.data?.message || 'Task update';

            addLog(agentId, message, data.success ? 'success' : 'error');

            if (data.success) {
                setActiveTasks(prev => {
                    const next = { ...prev };
                    delete next[agentId];
                    return next;
                });
            }
        });

        // Subscribe to thoughts which represent active processing
        const unsubThought = kernelBridge.onMessageType('thought', (data) => {
            if (data.data?.component) {
                setActiveTasks(prev => ({
                    ...prev,
                    [data.data.component]: data.data.content
                }));
            }
        });

        return () => {
            unsubTask();
            unsubThought();
        };
    }, []);

    const addLog = (agent: string, message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
        setTaskLogs(prev => [{
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date(),
            agent,
            message,
            type
        }, ...prev].slice(0, 100));
    };

    return (
        <div className="flex flex-col h-full bg-background/50 overflow-hidden font-mono text-xs">
            {/* Active Agents Summary */}
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 border-b border-border/50 bg-muted/10">
                {Object.entries(activeTasks).map(([agent, task]) => (
                    <div key={agent} className="bg-card border border-border rounded-lg p-3 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="font-bold text-primary uppercase">{agent}</span>
                            </div>
                            <Clock className="w-3 h-3 text-muted-foreground" />
                        </div>
                        <div className="text-muted-foreground truncate" title={task}>
                            {task}
                        </div>
                    </div>
                ))}
                {Object.keys(activeTasks).length === 0 && (
                    <div className="col-span-full flex items-center justify-center p-4 text-muted-foreground/50 border border-dashed border-border rounded-lg">
                        No active agents processing tasks.
                    </div>
                )}
            </div>

            {/* Task Log Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-thumb-border">
                <div className="flex items-center gap-2 text-muted-foreground mb-4 uppercase tracking-widest font-bold text-[10px]">
                    <Activity className="w-3 h-3" /> Event Log
                </div>
                {taskLogs.map((log) => (
                    <div key={log.id} className="flex gap-3 group hover:bg-muted/30 p-1 rounded transition-colors">
                        <span className="text-muted-foreground/40 w-16 shrink-0 tabular-nums">
                            {log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span className={`w-24 shrink-0 font-bold uppercase ${log.type === 'error' ? 'text-destructive' :
                            log.type === 'success' ? 'text-green-500' : 'text-primary'
                            }`}>
                            {log.agent}
                        </span>
                        <span className={`flex-1 break-all ${log.type === 'error' ? 'text-destructive/80' : 'text-foreground/80'
                            }`}>
                            {log.message}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
