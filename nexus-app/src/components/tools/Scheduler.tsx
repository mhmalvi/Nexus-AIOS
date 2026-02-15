
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, Clock, CheckCircle2, Circle, AlertCircle, MoreHorizontal, Plus, Play, Pause, Loader2, RefreshCw, X, Edit2, Trash2, Repeat, Bell, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { agentApi, cronApi } from '../../services/tauriApi';
import { motion, AnimatePresence } from 'framer-motion';

interface ScheduledTask {
    id: string;
    title: string;
    description?: string;
    scheduledTime: Date;
    agent: string;
    status: 'completed' | 'in-progress' | 'pending' | 'scheduled' | 'failed';
    type: 'system' | 'data' | 'maintenance' | 'user';
    progress?: number;
    recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
    priority: 'low' | 'medium' | 'high';
    createdAt: Date;
}

interface TaskFormData {
    title: string;
    description: string;
    scheduledTime: string;
    agent: string;
    recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
    priority: 'low' | 'medium' | 'high';
    type: 'system' | 'data' | 'maintenance' | 'user';
}



const defaultFormData: TaskFormData = {
    title: '',
    description: '',
    scheduledTime: '',
    agent: 'Manager',
    recurrence: 'none',
    priority: 'medium',
    type: 'user'
};

export function Scheduler() {
    const { ui, addThought, addNotification, swarm } = useStore();
    const [tasks, setTasks] = useState<ScheduledTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());

    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
    const [formData, setFormData] = useState<TaskFormData>(defaultFormData);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [executingTaskId, setExecutingTaskId] = useState<string | null>(null);

    // Load tasks from localStorage on mount
    // Load tasks from Kernel Cron on mount
    useEffect(() => {
        const loadTasks = async () => {
            try {
                const res = await cronApi.listJobs();
                if (res.success && res.data?.jobs) {
                    const mapped = res.data.jobs.map((j: any) => ({
                        id: j.job_id,
                        title: j.name,
                        description: j.payload?.prompt || '',
                        scheduledTime: j.next_run ? new Date(j.next_run * 1000) : new Date(),
                        agent: j.payload?.agent || 'Manager',
                        status: j.status === 'active' ? 'scheduled' : (j.status === 'disabled' ? 'completed' : 'pending'),
                        type: j.payload?.type || 'user',
                        recurrence: j.payload?.recurrence || 'none',
                        priority: j.payload?.priority || 'medium',
                        createdAt: new Date(j.created_at * 1000)
                    }));
                    setTasks(mapped);
                }
            } catch (e) {
                console.error('Failed to load tasks:', e);
            }
            setLoading(false);
        };
        loadTasks();
    }, []);

    // Save tasks to localStorage on change
    // Removed localStorage persistence effect


    // Update current time every second
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Add system tasks from swarm
    useEffect(() => {
        const systemTasks: ScheduledTask[] = swarm
            .filter(agent => agent.currentTask && agent.status !== 'idle')
            .map((agent, index) => ({
                id: `agent-${agent.id}-${Date.now()}`,
                title: agent.currentTask || 'Processing...',
                scheduledTime: new Date(Date.now() - (index * 15 * 60000)),
                agent: agent.name,
                status: agent.status === 'executing' ? 'in-progress' : agent.status === 'thinking' ? 'in-progress' : 'pending',
                type: 'system' as const,
                progress: agent.confidence,
                recurrence: 'none' as const,
                priority: 'medium' as const,
                createdAt: new Date()
            }));

        // Merge with user tasks (avoiding duplicates)
        setTasks(prev => {
            const userTasks = prev.filter(t => t.type === 'user' || !t.id.startsWith('agent-'));
            return [...userTasks, ...systemTasks];
        });
    }, [swarm]);

    const formatTime = (date: Date) => date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const handleOpenModal = (task?: ScheduledTask) => {
        if (task) {
            setEditingTask(task);
            setFormData({
                title: task.title,
                description: task.description || '',
                scheduledTime: new Date(task.scheduledTime).toISOString().slice(0, 16),
                agent: task.agent,
                recurrence: task.recurrence,
                priority: task.priority,
                type: task.type
            });
        } else {
            setEditingTask(null);
            const now = new Date();
            now.setMinutes(now.getMinutes() + 30);
            setFormData({
                ...defaultFormData,
                scheduledTime: now.toISOString().slice(0, 16)
            });
        }
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingTask(null);
        setFormData(defaultFormData);
    };

    const handleSaveTask = async () => {
        if (!formData.title.trim()) {
            addNotification({ type: 'error', title: 'Validation Error', message: 'Task title is required' });
            return;
        }

        try {
            // Convert Date to Cron Expression
            const date = new Date(formData.scheduledTime);
            let schedule = `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;

            if (formData.recurrence === 'daily') schedule = `${date.getMinutes()} ${date.getHours()} * * *`;
            if (formData.recurrence === 'weekly') schedule = `${date.getMinutes()} ${date.getHours()} * * ${date.getDay()}`;
            if (formData.recurrence === 'monthly') schedule = `${date.getMinutes()} ${date.getHours()} ${date.getDate()} * *`;

            if (editingTask) {
                await cronApi.removeJob(editingTask.id);
            }

            const res = await cronApi.addJob({
                id: editingTask?.id || '',
                title: formData.title.trim(),
                schedule,
                action: 'prompt',
                agent: formData.agent,
                recurrence: formData.recurrence
            });

            if (res.success) {
                addNotification({ type: 'success', title: 'Task Scheduled', message: `"${formData.title}" saved to kernel.` });
                // Reload tasks
                const listRes = await cronApi.listJobs();
                if (listRes.success && listRes.data?.jobs) {
                    const mapped = listRes.data.jobs.map((j: any) => ({
                        id: j.job_id,
                        title: j.name,
                        description: j.payload?.prompt || '',
                        scheduledTime: j.next_run ? new Date(j.next_run * 1000) : new Date(),
                        agent: j.payload?.agent || 'Manager',
                        status: j.status === 'active' ? 'scheduled' : 'completed',
                        type: 'user', // default
                        recurrence: j.payload?.recurrence || 'none',
                        priority: 'medium', // default
                        createdAt: new Date(j.created_at * 1000)
                    }));
                    setTasks(mapped);
                }
            } else {
                addNotification({ type: 'error', title: 'Schedule Failed', message: res.message || 'Unknown error' });
            }
        } catch (e) {
            console.error(e);
            addNotification({ type: 'error', title: 'Error', message: 'Failed to save task' });
        }

        handleCloseModal();
    };

    const handleDeleteTask = async (taskId: string) => {
        try {
            await cronApi.removeJob(taskId);
            setTasks(prev => prev.filter(t => t.id !== taskId));
            setShowDeleteConfirm(null);
            addNotification({ type: 'info', title: 'Task Deleted', message: 'Job removed from kernel.' });
        } catch (e) {
            addNotification({ type: 'error', title: 'Delete Failed', message: String(e) });
        }
    };

    const handleExecuteTask = async (task: ScheduledTask) => {
        setExecutingTaskId(task.id);

        addThought({
            id: Date.now().toString(),
            timestamp: new Date(),
            type: 'action',
            component: 'scheduler',
            content: `Scheduler: Executing task "${task.title}" via ${task.agent}...`
        });

        setTasks(prev => prev.map(t =>
            t.id === task.id ? { ...t, status: 'in-progress' as const, progress: 0 } : t
        ));

        try {
            await agentApi.executeTask(task.title, false);

            // Simulate progress updates
            for (let i = 0; i <= 100; i += 20) {
                await new Promise(r => setTimeout(r, 500));
                setTasks(prev => prev.map(t =>
                    t.id === task.id ? { ...t, progress: i } : t
                ));
            }

            setTasks(prev => prev.map(t =>
                t.id === task.id ? { ...t, status: 'completed' as const, progress: 100 } : t
            ));

            addNotification({ type: 'success', title: 'Task Completed', message: `"${task.title}" executed successfully.` });

            // Handle recurring tasks
            if (task.recurrence !== 'none') {
                const nextTime = new Date(task.scheduledTime);
                switch (task.recurrence) {
                    case 'daily': nextTime.setDate(nextTime.getDate() + 1); break;
                    case 'weekly': nextTime.setDate(nextTime.getDate() + 7); break;
                    case 'monthly': nextTime.setMonth(nextTime.getMonth() + 1); break;
                }
                const nextTask: ScheduledTask = {
                    ...task,
                    id: `task-${Date.now()}`,
                    scheduledTime: nextTime,
                    status: 'scheduled',
                    progress: undefined,
                    createdAt: new Date()
                };
                setTasks(prev => [...prev, nextTask]);
            }
        } catch (e) {
            setTasks(prev => prev.map(t =>
                t.id === task.id ? { ...t, status: 'failed' as const } : t
            ));
            addNotification({ type: 'error', title: 'Task Failed', message: `Failed to execute "${task.title}".` });
        } finally {
            setExecutingTaskId(null);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'text-green-500 bg-green-500/10 border-green-500/20';
            case 'in-progress': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
            case 'pending': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
            case 'failed': return 'text-red-500 bg-red-500/10 border-red-500/20';
            default: return 'text-muted-foreground bg-muted/10 border-border';
        }
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'high': return 'bg-red-500';
            case 'medium': return 'bg-yellow-500';
            case 'low': return 'bg-green-500';
            default: return 'bg-gray-500';
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'system': return 'bg-red-500';
            case 'data': return 'bg-purple-500';
            case 'maintenance': return 'bg-yellow-500';
            case 'user': return 'bg-blue-500';
            default: return 'bg-gray-500';
        }
    };

    // Calendar helpers
    const monthName = selectedDate.toLocaleString('default', { month: 'long' });
    const year = selectedDate.getFullYear();
    const today = new Date();
    const daysInMonth = new Date(year, selectedDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, selectedDate.getMonth(), 1).getDay();

    const calendarDays = useMemo(() => {
        const days = [];
        for (let i = 0; i < firstDayOfMonth; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) days.push(i);
        return days;
    }, [firstDayOfMonth, daysInMonth]);

    const isToday = (day: number | null) => {
        if (!day) return false;
        return day === today.getDate() &&
            selectedDate.getMonth() === today.getMonth() &&
            selectedDate.getFullYear() === today.getFullYear();
    };

    const hasTasksOnDay = (day: number | null) => {
        if (!day) return false;
        return tasks.some(t => {
            const taskDate = new Date(t.scheduledTime);
            return taskDate.getDate() === day &&
                taskDate.getMonth() === selectedDate.getMonth() &&
                taskDate.getFullYear() === selectedDate.getFullYear();
        });
    };

    const navigateMonth = (delta: number) => {
        setSelectedDate(prev => {
            const next = new Date(prev);
            next.setMonth(next.getMonth() + delta);
            return next;
        });
    };

    const userTasks = tasks.filter(t => !t.id.startsWith('agent-'));
    const todayTasks = tasks.filter(t => {
        const taskDate = new Date(t.scheduledTime);
        return taskDate.toDateString() === today.toDateString();
    });

    return (
        <div className="flex h-full bg-background/50 font-sans">
            {/* Calendar Sidebar */}
            <div className="w-72 border-r border-border/50 bg-muted/10 p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Chronos</h2>
                    <button
                        onClick={() => handleOpenModal()}
                        className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                        title="New Task"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                {/* Mini Calendar */}
                <div className="bg-card/50 rounded-xl border border-border/50 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <button onClick={() => navigateMonth(-1)} className="p-1 hover:bg-muted rounded">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-bold">{monthName} {year}</span>
                        <button onClick={() => navigateMonth(1)} className="p-1 hover:bg-muted rounded">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground mb-2">
                        <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-xs">
                        {calendarDays.map((day, i) => (
                            <div
                                key={i}
                                className={`relative p-1.5 rounded-lg cursor-pointer transition-colors hover:bg-muted 
                                    ${isToday(day) ? 'bg-primary text-primary-foreground font-bold shadow-md' : ''} 
                                    ${!day ? 'invisible' : ''}`}
                            >
                                {day}
                                {hasTasksOnDay(day) && (
                                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Current Time */}
                <div className="p-3 rounded-lg bg-card/30 border border-border/30">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Current Time</div>
                    <div className="text-2xl font-mono font-bold text-foreground">
                        {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                        {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 bg-card/30 rounded-lg border border-border/30 text-center">
                        <div className="text-lg font-bold text-foreground">{userTasks.length}</div>
                        <div className="text-[10px] text-muted-foreground">Total Tasks</div>
                    </div>
                    <div className="p-3 bg-card/30 rounded-lg border border-border/30 text-center">
                        <div className="text-lg font-bold text-green-500">{tasks.filter(t => t.status === 'completed').length}</div>
                        <div className="text-[10px] text-muted-foreground">Completed</div>
                    </div>
                </div>

                {/* Recurring Tasks Info */}
                <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2 text-xs font-medium text-primary mb-1">
                        <Repeat className="w-3 h-3" /> Recurring
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                        {tasks.filter(t => t.recurrence !== 'none').length} recurring tasks scheduled
                    </div>
                </div>
            </div>

            {/* Timeline View */}
            <div className="flex-1 flex flex-col overflow-hidden bg-background/30">
                <div className="h-14 border-b border-border/50 flex items-center justify-between px-6 bg-card/10 backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                        <h2 className="text-lg font-light">Today's Schedule</h2>
                        <span className="text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded-full border border-border/20">
                            {loading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : `${todayTasks.length} Tasks`}
                        </span>
                    </div>
                    <div className="flex gap-2">
                        <select className="bg-muted/20 border border-border/30 rounded-lg text-xs px-2 py-1.5 outline-none focus:border-primary">
                            <option>All Agents</option>
                            {swarm.map(agent => (
                                <option key={agent.id}>{agent.name}</option>
                            ))}
                        </select>
                        <button onClick={() => setLoading(true)} className="p-1.5 hover:bg-muted rounded-lg">
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="relative">
                        <div className="absolute left-16 top-0 bottom-0 w-px bg-border/30" />

                        <AnimatePresence>
                            {tasks.map((task) => (
                                <motion.div
                                    key={task.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className="relative flex gap-6 group mb-6"
                                >
                                    <div className="w-16 pt-3 text-right text-xs font-mono text-muted-foreground shrink-0">
                                        {formatTime(new Date(task.scheduledTime))}
                                    </div>

                                    {/* Node on Timeline */}
                                    <div className={`absolute left-[61px] top-3.5 w-2.5 h-2.5 rounded-full border-2 border-background z-10 ${getTypeColor(task.type)} shadow-sm`} />

                                    <div className="flex-1">
                                        <div className={`p-4 rounded-xl border transition-all hover:shadow-md ${getStatusColor(task.status)} bg-card/60 backdrop-blur-md`}>
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-1.5 h-6 rounded-full ${getPriorityColor(task.priority)}`} />
                                                    <div>
                                                        <h4 className="font-bold text-sm text-foreground">{task.title}</h4>
                                                        {task.description && (
                                                            <p className="text-[10px] text-muted-foreground mt-0.5">{task.description}</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {task.type === 'user' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleOpenModal(task)}
                                                                className="p-1.5 hover:bg-muted rounded"
                                                                title="Edit"
                                                            >
                                                                <Edit2 className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => setShowDeleteConfirm(task.id)}
                                                                className="p-1.5 hover:bg-red-500/20 text-red-500 rounded"
                                                                title="Delete"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </>
                                                    )}
                                                    {task.status === 'scheduled' && (
                                                        <button
                                                            onClick={() => handleExecuteTask(task)}
                                                            disabled={executingTaskId === task.id}
                                                            className="p-1.5 hover:bg-green-500/20 text-green-500 rounded"
                                                            title="Execute Now"
                                                        >
                                                            {executingTaskId === task.id ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            ) : (
                                                                <Play className="w-3.5 h-3.5" />
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between mt-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] bg-background/50 px-2 py-0.5 rounded border border-border/20 font-medium uppercase tracking-wider text-muted-foreground">
                                                        {task.agent}
                                                    </span>
                                                    {task.recurrence !== 'none' && (
                                                        <span className="text-[10px] text-primary flex items-center gap-1">
                                                            <Repeat className="w-3 h-3" />
                                                            {task.recurrence}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] opacity-70 capitalize flex items-center gap-1">
                                                        {task.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                                                        {task.status === 'in-progress' && <Loader2 className="w-3 h-3 animate-spin" />}
                                                        {task.status === 'pending' && <Circle className="w-3 h-3" />}
                                                        {task.status === 'scheduled' && <Clock className="w-3 h-3" />}
                                                        {task.status === 'failed' && <AlertCircle className="w-3 h-3" />}
                                                        {task.status}
                                                    </span>
                                                </div>

                                                {task.status === 'in-progress' && task.progress !== undefined && (
                                                    <div className="w-24 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                                                        <motion.div
                                                            className="h-full bg-blue-500"
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${task.progress}%` }}
                                                            transition={{ duration: 0.5 }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Delete Confirmation */}
                                        <AnimatePresence>
                                            {showDeleteConfirm === task.id && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-between"
                                                >
                                                    <span className="text-xs text-red-500">Delete this task?</span>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => setShowDeleteConfirm(null)}
                                                            className="px-3 py-1 text-xs bg-muted hover:bg-muted/80 rounded"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteTask(task.id)}
                                                            className="px-3 py-1 text-xs bg-red-500 text-white hover:bg-red-600 rounded"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {tasks.length === 0 && !loading && (
                            <div className="text-center py-20 text-muted-foreground">
                                <Clock className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                <p>No scheduled tasks.</p>
                                <p className="text-xs opacity-70 mb-4">Click the + button to create a task.</p>
                                <button
                                    onClick={() => handleOpenModal()}
                                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90"
                                >
                                    <Plus className="w-4 h-4 inline mr-1" /> New Task
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Task Modal */}
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
                        onClick={handleCloseModal}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-4 border-b border-border flex items-center justify-between">
                                <h3 className="font-bold">{editingTask ? 'Edit Task' : 'New Task'}</h3>
                                <button onClick={handleCloseModal} className="p-1 hover:bg-muted rounded">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="p-4 space-y-4">
                                <div>
                                    <label className="text-xs text-muted-foreground block mb-1">Title *</label>
                                    <input
                                        value={formData.title}
                                        onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                        placeholder="Task title..."
                                        className="w-full px-3 py-2 bg-muted/30 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <label className="text-xs text-muted-foreground block mb-1">Description</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                        placeholder="Optional description..."
                                        rows={2}
                                        className="w-full px-3 py-2 bg-muted/30 border border-border rounded-lg text-sm focus:outline-none focus:border-primary resize-none"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-muted-foreground block mb-1">Schedule</label>
                                        <input
                                            type="datetime-local"
                                            value={formData.scheduledTime}
                                            onChange={e => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
                                            className="w-full px-3 py-2 bg-muted/30 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-muted-foreground block mb-1">Agent</label>
                                        <select
                                            value={formData.agent}
                                            onChange={e => setFormData(prev => ({ ...prev, agent: e.target.value }))}
                                            className="w-full px-3 py-2 bg-muted/30 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                                        >
                                            {swarm.map(agent => (
                                                <option key={agent.id} value={agent.name}>{agent.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-muted-foreground block mb-1">Recurrence</label>
                                        <select
                                            value={formData.recurrence}
                                            onChange={e => setFormData(prev => ({ ...prev, recurrence: e.target.value as any }))}
                                            className="w-full px-3 py-2 bg-muted/30 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                                        >
                                            <option value="none">None</option>
                                            <option value="daily">Daily</option>
                                            <option value="weekly">Weekly</option>
                                            <option value="monthly">Monthly</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs text-muted-foreground block mb-1">Priority</label>
                                        <select
                                            value={formData.priority}
                                            onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value as any }))}
                                            className="w-full px-3 py-2 bg-muted/30 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                                        >
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 border-t border-border flex justify-end gap-2">
                                <button
                                    onClick={handleCloseModal}
                                    className="px-4 py-2 text-sm hover:bg-muted rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveTask}
                                    className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90"
                                >
                                    {editingTask ? 'Save Changes' : 'Create Task'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
