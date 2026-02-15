
import React, { useEffect, useState, useCallback } from "react";
import { useStore } from "../../context/StoreContext";
import { Brain, Shield, Code, BarChart3, Activity, GitCommit, Clock, RefreshCw, Loader2, Wifi, WifiOff, Zap, X, Send, MessageSquare, Play, Pause, Settings, History, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Agent } from "../../types";
import { kernelApi, agentApi } from "../../services/tauriApi";
import { kernelBridge } from "../../services/kernelEventBridge";

interface AgentLog {
    id: string;
    timestamp: Date;
    message: string;
    type: 'info' | 'action' | 'error' | 'success';
}

interface AgentTask {
    id: string;
    title: string;
    status: 'pending' | 'in-progress' | 'completed' | 'failed';
    timestamp: Date;
}

export function SwarmCluster() {
    const { swarm, updateAgentStatus, addNotification, addThought } = useStore();
    const [loading, setLoading] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
    const [kernelConnected, setKernelConnected] = useState(false);
    const [latency, setLatency] = useState<number>(0);

    // Modal states
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [taskInput, setTaskInput] = useState('');
    const [delegatingTask, setDelegatingTask] = useState(false);

    // Agent logs (simulated - would come from backend in production)
    const [agentLogs, setAgentLogs] = useState<Record<string, AgentLog[]>>({});
    const [agentTasks, setAgentTasks] = useState<Record<string, AgentTask[]>>({});

    // Subscribe to real kernel events for agent activity
    useEffect(() => {
        // Initialize empty logs/tasks for each agent
        const initialLogs: Record<string, AgentLog[]> = {};
        const initialTasks: Record<string, AgentTask[]> = {};
        swarm.forEach(agent => {
            initialLogs[agent.id] = [];
            initialTasks[agent.id] = [];
        });
        setAgentLogs(initialLogs);
        setAgentTasks(initialTasks);

        // Subscribe to kernel task_result events
        const unsubTask = kernelBridge.onMessageType('task_result', (data) => {
            const agentId = data?.data?.agent_id || 'manager';
            const log: AgentLog = {
                id: `kernel-${Date.now()}`,
                timestamp: new Date(),
                message: data?.data?.message || data?.data?.response || 'Task completed',
                type: data?.success ? 'success' : 'error',
            };
            setAgentLogs(prev => ({
                ...prev,
                [agentId]: [log, ...(prev[agentId] || [])].slice(0, 50),
            }));
        });

        // Subscribe to kernel response events (general activity)
        const unsubResponse = kernelBridge.onMessageType('response', (data) => {
            if (data?.data?.agent_id) {
                const agentId = data.data.agent_id;
                const log: AgentLog = {
                    id: `resp-${Date.now()}`,
                    timestamp: new Date(),
                    message: data.data.message || data.data.action || 'Processing',
                    type: 'info',
                };
                setAgentLogs(prev => ({
                    ...prev,
                    [agentId]: [log, ...(prev[agentId] || [])].slice(0, 50),
                }));
            }
        });

        // Subscribe to chunk events (streaming agent output)
        const unsubChunk = kernelBridge.onMessageType('chunk', (data) => {
            if (data?.data?.agent_id) {
                const agentId = data.data.agent_id;
                const log: AgentLog = {
                    id: `chunk-${Date.now()}`,
                    timestamp: new Date(),
                    message: data.data.content?.substring(0, 100) || 'Processing...',
                    type: 'action',
                };
                setAgentLogs(prev => ({
                    ...prev,
                    [agentId]: [log, ...(prev[agentId] || [])].slice(0, 50),
                }));
            }
        });

        return () => {
            unsubTask();
            unsubResponse();
            unsubChunk();
        };
    }, [swarm]);

    // Poll for real agent status
    useEffect(() => {
        const fetchAgentStatus = async () => {
            setLoading(true);
            const start = Date.now();

            try {
                const status = await kernelApi.getStatus();
                setKernelConnected(status.status === 'running');
                setLatency(Date.now() - start);
                setLastUpdate(new Date());
            } catch (error) {
                setKernelConnected(false);
                console.error("Failed to fetch agent status:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchAgentStatus();
        const interval = setInterval(fetchAgentStatus, 5000);
        return () => clearInterval(interval);
    }, [updateAgentStatus]);

    const handleOpenDetail = (agent: Agent) => {
        setSelectedAgent(agent);
        setShowDetailModal(true);
    };

    const handleCloseDetail = () => {
        setShowDetailModal(false);
        setSelectedAgent(null);
        setTaskInput('');
    };

    const handleDelegateTask = async () => {
        if (!taskInput.trim() || !selectedAgent) return;

        setDelegatingTask(true);

        const taskTitle = taskInput.trim();
        const newTask: AgentTask = {
            id: `task-${Date.now()}`,
            title: taskTitle,
            status: 'in-progress',
            timestamp: new Date()
        };

        // Add to agent's task history
        setAgentTasks(prev => ({
            ...prev,
            [selectedAgent.id]: [newTask, ...(prev[selectedAgent.id] || [])]
        }));

        // Add log entry
        setAgentLogs(prev => ({
            ...prev,
            [selectedAgent.id]: [
                { id: `log-${Date.now()}`, timestamp: new Date(), message: `Task assigned: "${taskTitle}"`, type: 'action' },
                ...(prev[selectedAgent.id] || [])
            ]
        }));

        // Update agent status
        updateAgentStatus(selectedAgent.id, {
            status: 'executing',
            currentTask: taskTitle,
            confidence: 75
        });

        addThought({
            id: Date.now().toString(),
            timestamp: new Date(),
            type: 'action',
            component: 'swarm',
            content: `Swarm: Task "${taskTitle}" delegated to ${selectedAgent.name}`
        });

        addNotification({
            type: 'info',
            title: 'Task Delegated',
            message: `"${taskTitle}" assigned to ${selectedAgent.name}`
        });

        try {
            await agentApi.executeTask(taskTitle, false);

            // Simulate task completion
            await new Promise(r => setTimeout(r, 3000));

            // Update task status
            setAgentTasks(prev => ({
                ...prev,
                [selectedAgent.id]: prev[selectedAgent.id]?.map(t =>
                    t.id === newTask.id ? { ...t, status: 'completed' as const } : t
                ) || []
            }));

            // Add completion log
            setAgentLogs(prev => ({
                ...prev,
                [selectedAgent.id]: [
                    { id: `log-${Date.now()}`, timestamp: new Date(), message: `Task completed: "${taskTitle}"`, type: 'success' },
                    ...(prev[selectedAgent.id] || [])
                ]
            }));

            updateAgentStatus(selectedAgent.id, {
                status: 'idle',
                currentTask: 'Awaiting instructions',
                confidence: 100
            });

            addNotification({
                type: 'success',
                title: 'Task Completed',
                message: `${selectedAgent.name} finished "${taskTitle}"`
            });
        } catch (e) {
            setAgentTasks(prev => ({
                ...prev,
                [selectedAgent.id]: prev[selectedAgent.id]?.map(t =>
                    t.id === newTask.id ? { ...t, status: 'failed' as const } : t
                ) || []
            }));

            setAgentLogs(prev => ({
                ...prev,
                [selectedAgent.id]: [
                    { id: `log-${Date.now()}`, timestamp: new Date(), message: `Task failed: "${taskTitle}"`, type: 'error' },
                    ...(prev[selectedAgent.id] || [])
                ]
            }));
        } finally {
            setDelegatingTask(false);
            setTaskInput('');
        }
    };

    const handleToggleAgent = (agentId: string) => {
        const agent = swarm.find(a => a.id === agentId);
        if (!agent) return;

        const newStatus = agent.status === 'idle' ? 'thinking' : 'idle';
        updateAgentStatus(agentId, { status: newStatus });

        addNotification({
            type: 'info',
            title: newStatus === 'idle' ? 'Agent Paused' : 'Agent Activated',
            message: `${agent.name} is now ${newStatus === 'idle' ? 'paused' : 'active'}`
        });
    };

    const manager = swarm.find(a => a.id === 'manager');
    const workers = swarm.filter(a => a.id !== 'manager');
    const activeCount = swarm.filter(a => a.status !== 'idle').length;
    const totalTasksCompleted = Object.values(agentTasks).flat().filter(t => t.status === 'completed').length;

    return (
        <div className="h-full bg-background/50 flex flex-col overflow-hidden relative">
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none" />

            {/* Header with Status */}
            <div className="p-4 border-b border-border/50 flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <Activity className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="font-bold text-sm">Swarm Cluster</h2>
                        <p className="text-[10px] text-muted-foreground">
                            {activeCount} active • {swarm.length} total agents
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Connection Status */}
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-medium border ${kernelConnected
                        ? 'bg-green-500/10 text-green-500 border-green-500/30'
                        : 'bg-orange-500/10 text-orange-500 border-orange-500/30'
                        }`}>
                        {kernelConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                        {kernelConnected ? 'CONNECTED' : 'DISCONNECTED'}
                        {kernelConnected && <span className="opacity-70">{latency}ms</span>}
                    </div>

                    {/* Last Update */}
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        {loading ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                            <RefreshCw className="w-3 h-3" />
                        )}
                        Updated {lastUpdate.toLocaleTimeString()}
                    </div>
                </div>
            </div>

            <div className="flex-1 p-6 overflow-auto">
                {/* Manager Node - Orchestrator */}
                <div className="flex justify-center mb-10 relative z-10">
                    {manager && (
                        <AgentCard
                            agent={manager}
                            isManager
                            kernelConnected={kernelConnected}
                            onClick={() => handleOpenDetail(manager)}
                            onToggle={() => handleToggleAgent(manager.id)}
                        />
                    )}
                </div>

                {/* Connection Lines */}
                <div className="absolute top-[180px] left-0 right-0 h-20 flex justify-center pointer-events-none z-0">
                    <svg className="w-full h-full">
                        <path d="M 50% 0 L 50% 20 L 20% 50 L 20% 100" fill="none" stroke="currentColor" className="text-border/50" strokeWidth="1" />
                        <path d="M 50% 0 L 50% 20 L 50% 100" fill="none" stroke="currentColor" className="text-border/50" strokeWidth="1" />
                        <path d="M 50% 0 L 50% 20 L 80% 50 L 80% 100" fill="none" stroke="currentColor" className="text-border/50" strokeWidth="1" />

                        {/* Animated Packets - only when kernel connected */}
                        {kernelConnected && (
                            <>
                                <circle r="2" fill="currentColor" className="text-primary animate-pulse">
                                    <animateMotion dur="2s" repeatCount="indefinite" path="M 50% 0 L 50% 20 L 20% 50 L 20% 100" />
                                </circle>
                                <circle r="2" fill="currentColor" className="text-primary animate-pulse">
                                    <animateMotion dur="2s" repeatCount="indefinite" begin="1s" path="M 50% 0 L 50% 20 L 80% 50 L 80% 100" />
                                </circle>
                            </>
                        )}
                    </svg>
                </div>

                {/* Worker Nodes */}
                <div className="grid grid-cols-3 gap-6 relative z-10">
                    {workers.map((agent) => (
                        <AgentCard
                            key={agent.id}
                            agent={agent}
                            kernelConnected={kernelConnected}
                            onClick={() => handleOpenDetail(agent)}
                            onToggle={() => handleToggleAgent(agent.id)}
                        />
                    ))}
                </div>
            </div>

            {/* Footer Stats */}
            <div className="p-3 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground relative z-10">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        Tasks Completed: {totalTasksCompleted}
                    </span>
                    <span>Uptime: {Math.floor((Date.now() - lastUpdate.getTime()) / 1000 / 60)}m</span>
                </div>
                <span className="font-mono">Nexus Swarm v3.1.0</span>
            </div>

            {/* Agent Detail Modal */}
            <AnimatePresence>
                {showDetailModal && selectedAgent && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
                        onClick={handleCloseDetail}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="p-4 border-b border-border flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${selectedAgent.status !== 'idle' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                        {getIcon(selectedAgent.avatar)}
                                    </div>
                                    <div>
                                        <h3 className="font-bold">{selectedAgent.name}</h3>
                                        <p className="text-xs text-muted-foreground">{selectedAgent.role}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(selectedAgent.status)}`}>
                                        {selectedAgent.status}
                                    </span>
                                    <button onClick={handleCloseDetail} className="p-1 hover:bg-muted rounded">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {/* Current Task */}
                                <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                                    <div className="text-xs text-muted-foreground mb-1">Current Task</div>
                                    <div className="font-mono text-sm">{selectedAgent.currentTask}</div>
                                    <div className="mt-2 flex items-center gap-2">
                                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary transition-all"
                                                style={{ width: `${selectedAgent.confidence}%` }}
                                            />
                                        </div>
                                        <span className="text-xs font-mono">{selectedAgent.confidence}%</span>
                                    </div>
                                </div>

                                {/* Task Delegation */}
                                <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                                    <div className="text-xs font-medium text-primary mb-2 flex items-center gap-1">
                                        <Send className="w-3 h-3" /> Delegate Task
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            value={taskInput}
                                            onChange={e => setTaskInput(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleDelegateTask()}
                                            placeholder="Enter task to assign..."
                                            className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                                            disabled={delegatingTask}
                                        />
                                        <button
                                            onClick={handleDelegateTask}
                                            disabled={delegatingTask || !taskInput.trim()}
                                            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
                                        >
                                            {delegatingTask ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                            Execute
                                        </button>
                                    </div>
                                </div>

                                {/* Tabs: Logs | History */}
                                <div className="grid grid-cols-2 gap-4">
                                    {/* Logs */}
                                    <div className="bg-muted/20 rounded-lg border border-border/50 overflow-hidden">
                                        <div className="px-3 py-2 border-b border-border/50 flex items-center gap-2 text-xs font-medium">
                                            <MessageSquare className="w-3 h-3" /> Activity Logs
                                        </div>
                                        <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                                            {(agentLogs[selectedAgent.id] || []).slice(0, 10).map(log => (
                                                <div key={log.id} className="text-[10px] py-1 px-2 rounded bg-background/50 flex items-start gap-2">
                                                    <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${log.type === 'success' ? 'bg-green-500' :
                                                        log.type === 'error' ? 'bg-red-500' :
                                                            log.type === 'action' ? 'bg-blue-500' : 'bg-gray-500'
                                                        }`} />
                                                    <div className="flex-1">
                                                        <span className="text-muted-foreground">{log.timestamp.toLocaleTimeString()}</span>
                                                        <span className="ml-2">{log.message}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Task History */}
                                    <div className="bg-muted/20 rounded-lg border border-border/50 overflow-hidden">
                                        <div className="px-3 py-2 border-b border-border/50 flex items-center gap-2 text-xs font-medium">
                                            <History className="w-3 h-3" /> Task History
                                        </div>
                                        <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                                            {(agentTasks[selectedAgent.id] || []).slice(0, 10).map(task => (
                                                <div key={task.id} className="text-[10px] py-1 px-2 rounded bg-background/50 flex items-center justify-between">
                                                    <span className="truncate flex-1">{task.title}</span>
                                                    <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] uppercase ${task.status === 'completed' ? 'bg-green-500/20 text-green-500' :
                                                        task.status === 'failed' ? 'bg-red-500/20 text-red-500' :
                                                            task.status === 'in-progress' ? 'bg-blue-500/20 text-blue-500' : 'bg-muted'
                                                        }`}>
                                                        {task.status}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Agent Stats */}
                                <div className="grid grid-cols-4 gap-3">
                                    <div className="p-3 bg-muted/20 rounded-lg text-center">
                                        <div className="text-lg font-bold">{(agentTasks[selectedAgent.id] || []).filter(t => t.status === 'completed').length}</div>
                                        <div className="text-[10px] text-muted-foreground">Completed</div>
                                    </div>
                                    <div className="p-3 bg-muted/20 rounded-lg text-center">
                                        <div className="text-lg font-bold">{(agentTasks[selectedAgent.id] || []).filter(t => t.status === 'in-progress').length}</div>
                                        <div className="text-[10px] text-muted-foreground">In Progress</div>
                                    </div>
                                    <div className="p-3 bg-muted/20 rounded-lg text-center">
                                        <div className="text-lg font-bold text-green-500">{selectedAgent.confidence}%</div>
                                        <div className="text-[10px] text-muted-foreground">Confidence</div>
                                    </div>
                                    <div className="p-3 bg-muted/20 rounded-lg text-center">
                                        <div className="text-lg font-bold">{latency}ms</div>
                                        <div className="text-[10px] text-muted-foreground">Latency</div>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 border-t border-border flex justify-between">
                                <button
                                    onClick={() => handleToggleAgent(selectedAgent.id)}
                                    className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${selectedAgent.status !== 'idle'
                                        ? 'bg-orange-500/10 text-orange-500 hover:bg-orange-500/20'
                                        : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                                        }`}
                                >
                                    {selectedAgent.status !== 'idle' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                    {selectedAgent.status !== 'idle' ? 'Pause Agent' : 'Activate Agent'}
                                </button>
                                <button
                                    onClick={handleCloseDetail}
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

interface AgentCardProps {
    agent: Agent;
    isManager?: boolean;
    kernelConnected?: boolean;
    onClick?: () => void;
    onToggle?: () => void;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, isManager = false, kernelConnected = false, onClick, onToggle }) => {
    const isActive = agent.status !== 'idle';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`relative group rounded-2xl border backdrop-blur-xl transition-all duration-300 overflow-hidden cursor-pointer
                ${isManager ? 'w-[400px] h-[160px]' : 'h-[240px]'}
                ${isActive
                    ? 'bg-card/80 border-primary/30 shadow-[0_0_30px_-10px_rgba(var(--primary),0.3)]'
                    : 'bg-card/40 border-border shadow-sm grayscale-[0.5] hover:grayscale-0'}
            `}
            onClick={onClick}
        >
            {/* Active Scan Line */}
            {isActive && (
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent animate-[scan_3s_ease-in-out_infinite]" />
            )}

            <div className="p-5 flex flex-col h-full relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                            {getIcon(agent.avatar)}
                        </div>
                        <div>
                            <h3 className="font-bold text-sm tracking-wide">{agent.name}</h3>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{agent.role}</p>
                            {agent.model && <p className="text-[9px] text-primary/70 font-mono mt-0.5">{agent.model}</p>}
                        </div>
                    </div>
                    {/* Confidence Meter (Circular) */}
                    <div className="relative w-10 h-10 flex items-center justify-center">
                        <svg className="w-full h-full -rotate-90">
                            <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" className="text-muted/20" strokeWidth="3" />
                            <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor"
                                className={`${agent.confidence > 80 ? 'text-green-500' : 'text-primary'} transition-all duration-1000`}
                                strokeWidth="3"
                                strokeDasharray="100"
                                strokeDashoffset={100 - agent.confidence}
                            />
                        </svg>
                        <span className="absolute text-[9px] font-bold">{agent.confidence}%</span>
                    </div>
                </div>

                {/* Content Body */}
                <div className="flex-1 flex flex-col gap-2">
                    <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${getStatusColor(agent.status)}`}>
                            {agent.status}
                        </span>
                        {agent.status === 'thinking' && <Activity className="w-3 h-3 text-primary animate-pulse" />}
                        {agent.status === 'executing' && <Loader2 className="w-3 h-3 text-green-500 animate-spin" />}
                    </div>

                    <div className="bg-black/20 rounded p-2.5 flex-1 border border-white/5 font-mono text-[10px] text-muted-foreground overflow-hidden relative">
                        <p className="leading-relaxed opacity-80">
                            <span className="text-primary mr-1">task:</span>
                            {agent.currentTask}
                        </p>
                        {isActive && <span className="inline-block w-1.5 h-3 bg-primary/50 animate-pulse ml-1 align-middle" />}
                    </div>
                </div>

                {/* Footer */}
                {!isManager && (
                    <div className="mt-3 pt-3 border-t border-border/30 flex justify-between items-center text-[10px] text-muted-foreground">
                        <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{kernelConnected ? `${Math.floor(Math.random() * 30) + 10}ms` : '--'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <GitCommit className="w-3 h-3" />
                            <span>v3.0.1</span>
                        </div>
                        <div className={`w-2 h-2 rounded-full ${kernelConnected ? 'bg-green-500' : 'bg-orange-500'}`} />
                    </div>
                )}

                {/* Hover overlay with actions */}
                <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <span className="text-xs font-medium flex items-center gap-1">
                        Click for details <ChevronRight className="w-3 h-3" />
                    </span>
                </div>
            </div>
        </motion.div>
    );
};

function getIcon(avatar: string) {
    switch (avatar) {
        case 'Brain': return <Brain className="w-5 h-5" />;
        case 'Shield': return <Shield className="w-5 h-5" />;
        case 'Code': return <Code className="w-5 h-5" />;
        case 'BarChart': return <BarChart3 className="w-5 h-5" />;
        default: return <Activity className="w-5 h-5" />;
    }
}

function getStatusColor(status: string) {
    switch (status) {
        case 'thinking': return 'text-primary bg-primary/10 border-primary/30';
        case 'executing': return 'text-green-500 bg-green-500/10 border-green-500/30';
        case 'reviewing': return 'text-orange-500 bg-orange-500/10 border-orange-500/30';
        default: return 'text-muted-foreground bg-muted/30 border-border';
    }
}
