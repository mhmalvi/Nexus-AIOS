
import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, RefreshCw, Hash, Phone, Globe, Wifi, WifiOff, ChevronRight, Settings, Search, ToggleLeft, ToggleRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { messagingApi, KernelResponse } from "../../services/tauriApi";

interface Channel {
    type: string;
    enabled: boolean;
    connected: boolean;
    display_name: string;
    message_count: number;
}

interface Message {
    id: string;
    channel: string;
    direction: 'inbound' | 'outbound';
    sender: string;
    content: string;
    timestamp: string;
}

const CHANNEL_ICONS: Record<string, string> = {
    whatsapp: '💬',
    telegram: '✈️',
    discord: '🎮',
    slack: '💼',
    sms: '📱',
    email: '📧',
};

export function MessagingDashboard() {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [messageInput, setMessageInput] = useState('');
    const [recipientInput, setRecipientInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [channelStats, setChannelStats] = useState<{ total_messages: number; active_channels: number }>({ total_messages: 0, active_channels: 0 });
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Fetch channels on mount
    useEffect(() => {
        fetchChannels();
        const interval = setInterval(fetchChannels, 15000);
        return () => clearInterval(interval);
    }, []);

    // Fetch messages when channel is selected
    useEffect(() => {
        if (selectedChannel) {
            fetchHistory(selectedChannel);
        }
    }, [selectedChannel]);

    const fetchChannels = async () => {
        setError(null);
        try {
            const res = await messagingApi.listChannels();
            if (res?.success && res?.data?.channels) {
                setChannels(res.data.channels);
                setChannelStats(res.data.stats || { total_messages: 0, active_channels: 0 });
            } else if (res?.error) {
                setError(res.error);
            }
        } catch (e) {
            console.error("Failed to fetch channels:", e);
            setError("Failed to communicate with kernel.");
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async (channel: string) => {
        try {
            const res = await messagingApi.getHistory(channel, 50);
            if (res?.success && res?.data?.messages) {
                setMessages(res.data.messages);
                setTimeout(() => messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' }), 100);
            } else {
                setMessages([]);
            }
        } catch (e) {
            setMessages([]);
        }
    };

    const handleSend = async () => {
        if (!messageInput.trim() || !selectedChannel) return;
        setSending(true);
        try {
            const res = await messagingApi.send(selectedChannel, recipientInput || '', messageInput);
            if (res?.success) {
                setMessages(prev => [...prev, {
                    id: `sent-${Date.now()}`,
                    channel: selectedChannel,
                    direction: 'outbound',
                    sender: 'AETHER',
                    content: messageInput,
                    timestamp: new Date().toISOString(),
                }]);
                setMessageInput('');
            }
        } catch (e) {
            console.error("Send failed:", e);
        } finally {
            setSending(false);
        }
    };

    const handleToggleChannel = async (channelType: string, currentEnabled: boolean) => {
        try {
            await messagingApi.toggleChannel(channelType, !currentEnabled);
            fetchChannels();
        } catch (e) {
            console.error("Toggle failed:", e);
        }
    };

    const selectedChannelInfo = channels.find(c => c.type === selectedChannel);

    return (
        <div className="flex h-full bg-background text-foreground overflow-hidden font-sans">
            {/* Left Sidebar - Channel List */}
            <div className="w-56 border-r border-border/40 flex flex-col bg-card/30">
                <div className="p-4 border-b border-border/30">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-primary" />
                        <span className="text-xs font-bold uppercase tracking-widest text-foreground/80">Messaging</span>
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-1">OpenClaw Channel Router</p>
                </div>

                {/* Channel List */}
                <div className="flex-1 p-2 space-y-1 overflow-y-auto">
                    {loading && (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        </div>
                    )}
                    {error && (
                        <div className="p-3 m-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-[10px] text-center">
                            {error}
                        </div>
                    )}
                    {!loading && !error && channels.length === 0 && (
                        <div className="text-center py-6 text-muted-foreground">
                            <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-20" />
                            <p className="text-[10px]">No channels configured.</p>
                            <p className="text-[9px] opacity-60 mt-1">Enable OpenClaw in Settings.</p>
                        </div>
                    )}
                    {channels.map(channel => (
                        <button
                            key={channel.type}
                            onClick={() => setSelectedChannel(channel.type)}
                            className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all
                                ${selectedChannel === channel.type
                                    ? 'bg-primary/10 text-primary border border-primary/20'
                                    : 'hover:bg-muted/50 text-muted-foreground border border-transparent hover:text-foreground'
                                }
                                ${!channel.enabled ? 'opacity-50' : ''}`}
                        >
                            <span className="text-base">{CHANNEL_ICONS[channel.type] || '📨'}</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-[11px] font-medium truncate">{channel.display_name}</div>
                                <div className="flex items-center gap-1 mt-0.5">
                                    <div className={`w-1.5 h-1.5 rounded-full ${channel.connected ? 'bg-green-500' : 'bg-zinc-500'}`} />
                                    <span className="text-[9px] text-muted-foreground">
                                        {channel.connected ? 'Connected' : 'Offline'}
                                    </span>
                                </div>
                            </div>
                            {channel.message_count > 0 && (
                                <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[9px] font-bold">
                                    {channel.message_count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Stats Footer */}
                <div className="p-4 border-t border-border/30 space-y-2">
                    <div className="bg-muted/30 rounded-xl p-3 border border-border/20">
                        <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Total Messages</p>
                        <p className="text-xl font-bold text-primary">{channelStats.total_messages}</p>
                        <p className="text-[9px] text-muted-foreground mt-1">{channelStats.active_channels} active channels</p>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {!selectedChannel ? (
                    /* No channel selected */
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                        <div className="text-center">
                            <Globe className="w-10 h-10 mx-auto mb-3 opacity-20" />
                            <p className="text-sm font-medium">Select a Channel</p>
                            <p className="text-[10px] opacity-60 mt-1">Choose a messaging channel from the sidebar to view messages.</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Channel Header */}
                        <div className="p-4 border-b border-border/40 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="text-lg">{CHANNEL_ICONS[selectedChannel] || '📨'}</span>
                                <div>
                                    <h2 className="text-sm font-semibold">{selectedChannelInfo?.display_name || selectedChannel}</h2>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        {selectedChannelInfo?.connected ? (
                                            <span className="flex items-center gap-1 text-[10px] text-green-500">
                                                <Wifi className="w-3 h-3" /> Connected
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                <WifiOff className="w-3 h-3" /> Disconnected
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleToggleChannel(selectedChannel, selectedChannelInfo?.enabled ?? false)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors flex items-center gap-1.5 ${selectedChannelInfo?.enabled
                                        ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                                        : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                                        }`}
                                >
                                    {selectedChannelInfo?.enabled ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                                    {selectedChannelInfo?.enabled ? 'Enabled' : 'Disabled'}
                                </button>
                                <button onClick={() => fetchHistory(selectedChannel)} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground">
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {messages.length === 0 && (
                                <div className="text-center py-12 text-muted-foreground">
                                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                    <p className="text-xs">No messages yet.</p>
                                    <p className="text-[10px] opacity-60 mt-1">Messages will appear here when received.</p>
                                </div>
                            )}
                            {messages.map((msg) => (
                                <motion.div
                                    key={msg.id}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${msg.direction === 'outbound'
                                        ? 'bg-primary/15 text-foreground border border-primary/20'
                                        : 'bg-card border border-border/40'
                                        }`}>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[9px] font-bold text-muted-foreground">{msg.sender}</span>
                                            <span className="text-[9px] text-muted-foreground/50">
                                                {new Date(msg.timestamp).toLocaleTimeString()}
                                            </span>
                                        </div>
                                        <p className="text-[11px] leading-relaxed">{msg.content}</p>
                                    </div>
                                </motion.div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Message Input */}
                        <div className="p-3 border-t border-border/40 space-y-2">
                            <div className="flex gap-2">
                                <input
                                    value={recipientInput}
                                    onChange={e => setRecipientInput(e.target.value)}
                                    placeholder="Recipient (phone/username)"
                                    className="w-40 bg-input/50 border border-border rounded-xl px-3 py-2 text-[11px] placeholder-muted-foreground/50 focus:outline-none focus:border-primary/50"
                                />
                                <div className="flex-1 flex gap-2">
                                    <input
                                        value={messageInput}
                                        onChange={e => setMessageInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                                        placeholder="Type a message..."
                                        className="flex-1 bg-input/50 border border-border rounded-xl px-4 py-2 text-sm placeholder-muted-foreground/50 focus:outline-none focus:border-primary/50"
                                        disabled={sending || !selectedChannelInfo?.enabled}
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={sending || !messageInput.trim() || !selectedChannelInfo?.enabled}
                                        className="px-4 py-2 bg-primary/15 hover:bg-primary/25 text-primary rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                    >
                                        {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
