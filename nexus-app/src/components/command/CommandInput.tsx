
import React, { useState, useRef, useEffect } from "react";
import { Send, Mic, MicOff, Sparkles, Command, Radio, Zap } from "lucide-react";
import { Button } from "../ui/Button";
import { useStore } from "../../context/StoreContext";
import { aiService } from "../../services/aiService";
import { ActionRequest } from "../../types";

export function CommandInput() {
  const [input, setInput] = useState("");
  const { 
    addToHistory, addMessage, updateMessage, agent, setThinking, 
    startListening, stopListening, addThought, openWindow, focusWindow, 
    setPendingAction
  } = useStore();
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const adjustHeight = () => {
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    adjustHeight();
  };

  const handleSubmit = async (text: string = input) => {
    if (!text.trim() || isProcessing) return;
    
    setIsProcessing(true);
    setThinking(true);
    openWindow('chat');
    focusWindow('chat');
    
    if (agent.isListening) stopListening();

    const userMessageId = Date.now().toString();
    addMessage({
      id: userMessageId,
      role: 'user',
      content: text,
      timestamp: new Date()
    });

    addToHistory(text);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // UI Feedback Thought
    addThought({
      id: `thought-${Date.now()}`,
      timestamp: new Date(),
      type: 'thought',
      component: 'scheduler',
      content: `Kernel: Intercepting intent. Dispatching thread to Gemini Reasoning Core...`
    });

    const assistantMessageId = (Date.now() + 1).toString();
    let assistantContent = "";

    // Add empty placeholder for streaming
    addMessage({
      id: assistantMessageId,
      role: 'assistant',
      content: "...",
      timestamp: new Date()
    });

    try {
      await aiService.sendMessage(
        text, 
        (chunk) => {
            assistantContent += chunk;
            updateMessage(assistantMessageId, assistantContent);
            
            // Dynamic thinking triggers
            if (assistantContent.length % 50 === 0) {
                addThought({
                    id: `thought-stream-${Date.now()}`,
                    timestamp: new Date(),
                    type: 'thought',
                    component: 'worker',
                    content: `Worker: Synthesizing segment... [${assistantContent.length} chars]`
                });
            }
        },
        (action: ActionRequest) => {
            // Handle Tool Call - Trigger HIL Modal
            setPendingAction(action);
            addThought({
                id: `action-detect-${Date.now()}`,
                timestamp: new Date(),
                type: 'action',
                component: 'supervisor',
                content: `Supervisor: Intercepted tool call '${action.tool}'. Initiating HIL Protocol for command: ${action.command}`
            });
        }
      );
      
    } catch (err) {
      console.error(err);
      updateMessage(assistantMessageId, "ERROR: Neural link compromised. Kernel panic.");
    } finally {
      setIsProcessing(false);
      setThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative group flex flex-col gap-2">
        <div className={`absolute bottom-0 left-0 right-0 h-[60px] rounded-xl blur opacity-20 transition duration-500 pointer-events-none ${isProcessing ? 'bg-primary animate-pulse' : 'bg-primary/10'}`}></div>
        
        <div className={`relative flex items-end gap-2 bg-background/80 backdrop-blur-2xl border border-border rounded-xl p-2 shadow-2xl transition-all duration-300 ${isProcessing ? 'ring-1 ring-primary/50' : ''}`}>
            <div className="flex flex-col items-center justify-end h-full py-1 pl-2">
                 {isProcessing ? <Radio className="w-4 h-4 text-primary animate-pulse" /> : <Command className="w-4 h-4 text-muted-foreground/30" />}
            </div>

            <textarea
                ref={textareaRef}
                value={input} 
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                disabled={isProcessing}
                placeholder={isProcessing ? "Kernel processing..." : "Ask Nexus..."}
                className="flex-1 max-h-[120px] min-h-[40px] bg-transparent border-none resize-none py-2.5 px-2 focus:outline-none text-sm placeholder:text-muted-foreground/50 font-sans leading-relaxed transition-all text-foreground disabled:opacity-50"
                rows={1}
            />
            
            <div className="flex items-center gap-1 pb-0.5">
                <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => startListening()}
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted/50"
                >
                    <Mic className="w-4 h-4" />
                </Button>
                
                <Button 
                    onClick={() => handleSubmit()} 
                    disabled={!input || isProcessing}
                    size="icon"
                    className="h-8 w-8 rounded-lg bg-foreground text-background hover:bg-foreground/90"
                >
                    {isProcessing ? <Sparkles className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
            </div>
      </div>
    </div>
  );
}