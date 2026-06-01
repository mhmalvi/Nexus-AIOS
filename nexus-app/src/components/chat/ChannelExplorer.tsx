import React, { useEffect, useState, useCallback } from 'react';
import { messagingApi } from '../../services/tauriApi';
import { mockTauri } from '../../services/mockTauri';
import { Hash, MessageCircle, Server, Globe, Smartphone } from 'lucide-react';

interface Channel {
    type: string;
    enabled: boolean;
    connected: boolean;
    display_name: string;
    message_count: number;
}

interface ChannelExplorerProps {
    onChannelClick?: (channelType: string) => void;
}

export function ChannelExplorer({ onChannelClick }: ChannelExplorerProps) {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

    const loadChannels = useCallback(async () => {
        try {
            const res = await messagingApi.listChannels();
            if (res.success && res.data?.channels) {
                setChannels(res.data.channels);
            }
        } catch (e) {
            console.error("Failed to load channels", e);
        }
    }, []);

    // Poll for channel list (fallback, 30s)
    useEffect(() => {
        loadChannels();
        const interval = setInterval(loadChannels, 30000);
        return () => clearInterval(interval);
    }, [loadChannels]);

    // Subscribe to real-time openclaw events
    useEffect(() => {
        const unsub = mockTauri.subscribeOpenClaw((msg: any) => {
            const channelType = msg.channel || msg.platform || 'unknown';
            setUnreadCounts(prev => ({
                ...prev,
                [channelType]: (prev[channelType] || 0) + 1,
            }));
            // Refresh channel list on new message
            loadChannels();
        });
        return () => unsub();
    }, [loadChannels]);

    const handleChannelClick = (channelType: string) => {
        // Clear unread count on click
        setUnreadCounts(prev => {
            const next = { ...prev };
            delete next[channelType];
            return next;
        });
        onChannelClick?.(channelType);
    };

    const getIcon = (type: string) => {
        switch (type.toLowerCase()) {
            case 'discord': return <Server className="w-4 h-4 text-indigo-400" />;
            case 'telegram': return <MessageCircle className="w-4 h-4 text-blue-400" />;
            case 'whatsapp': return <Smartphone className="w-4 h-4 text-green-400" />;
            default: return <Hash className="w-4 h-4 text-muted-foreground" />;
        }
    };

    return (
        <div className="flex flex-col space-y-1 mt-4 border-t border-border/30 pt-4">
            <div className="flex items-center justify-between px-2 mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Active Channels
                </h3>
                <Globe className="w-3 h-3 text-muted-foreground/50" />
            </div>

            <div className="space-y-0.5">
                {channels.map((ch, i) => {
                    const unread = unreadCounts[ch.type] || 0;
                    return (
                        <div
                            key={i}
                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${ch.connected ? 'hover:bg-muted/50 text-foreground/80' : 'opacity-60 text-muted-foreground'}`}
                            title={ch.connected ? "Connected" : "Disconnected"}
                            onClick={() => handleChannelClick(ch.type)}
                        >
                            {getIcon(ch.type)}
                            <span className="flex-1 truncate text-xs font-medium">{ch.display_name}</span>

                            {unread > 0 ? (
                                <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold animate-pulse">
                                    {unread}
                                </span>
                            ) : ch.connected && ch.message_count > 0 ? (
                                <span className="bg-primary/20 text-primary text-[9px] px-1.5 py-0.5 rounded-full font-mono">
                                    {ch.message_count}
                                </span>
                            ) : null}

                            <div className={`w-1.5 h-1.5 rounded-full ${ch.connected ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.4)]' : 'bg-red-500/30'}`} />
                        </div>
                    );
                })}

                {channels.length === 0 && (
                    <div className="px-2 py-4 text-center text-xs text-muted-foreground/50 italic border border-dashed border-border/30 rounded-lg mx-2">
                        No OpenClaw channels detected
                    </div>
                )}
            </div>
        </div>
    );
}
