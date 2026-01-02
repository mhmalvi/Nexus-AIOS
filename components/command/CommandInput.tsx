
import React, { useState, useRef, useEffect } from "react";
import { Send, Mic, Paperclip, MicOff, Sparkles, Command, Radio, Zap } from "lucide-react";
import { Button } from "../ui/Button";
import { useStore } from "../../context/StoreContext";

// Type definition for Web Speech API
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export function CommandInput() {
  const [input, setInput] = useState("");
  const { addToHistory, addMessage, agent, startListening, stopListening, setTranscript, spawnArtifact } = useStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  // Mock "Ghost Actions" - Contextual suggestions
  const ghostActions = [
    { label: "Summarize", icon: Sparkles },
    { label: "Deploy to Prod", icon: Zap },
    { label: "Debug Trace", icon: Command },
  ];

  useEffect(() => {
    // Initialize Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentText = finalTranscript || interimTranscript;
        setTranscript(currentText);
        if (currentText) {
             setInput(currentText);
             adjustHeight();
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        stopListening();
      };

      recognition.onend = () => {
        if (agent.isListening) {
             // Re-start logic if needed
        }
      };

      recognitionRef.current = recognition;
    }
  }, [agent.isListening, setTranscript, stopListening]);

  // Handle listening state changes
  useEffect(() => {
    if (!recognitionRef.current) return;
    if (agent.isListening) {
        try { recognitionRef.current.start(); } catch (e) { /* ignore */ }
    } else {
        recognitionRef.current.stop();
    }
  }, [agent.isListening]);

  const adjustHeight = () => {
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleSubmit = (text: string = input) => {
    if (!text.trim()) return;
    
    if (agent.isListening) stopListening();

    addMessage({
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date()
    });

    addToHistory(text);
    
    // Simulating Assistant Response with Artifact Spawning
    setTimeout(() => {
        const artifactId = `art-${Date.now()}`;
        spawnArtifact({
            id: artifactId,
            title: 'Deployment Configuration',
            type: 'code',
            content: `version: '3.8'\nservices:\n  web:\n    image: nexus-core:latest\n    ports:\n      - "8080:80"`,
            isVisible: true,
            position: { x: Math.random() * 200, y: Math.random() * 100 }
        });

        addMessage({
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: "I've generated the deployment configuration. You can view it in the workspace.",
            timestamp: new Date(),
            tool: 'terminal',
            relatedArtifactId: artifactId
        })
    }, 800);

    setInput("");
    setTranscript(""); 
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    adjustHeight();
  };

  const toggleVoice = () => {
    if (agent.isListening) {
        stopListening();
    } else {
        setInput(""); 
        setTranscript("");
        startListening();
    }
  };

  return (
    <div className="relative group flex flex-col gap-2">
        {/* Ghost Actions */}
        <div className="flex gap-2 px-2 overflow-x-auto opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-y-2 group-hover:translate-y-0">
            {ghostActions.map((action, i) => (
                <button 
                    key={i}
                    onClick={() => handleSubmit(action.label)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/60 backdrop-blur border border-white/5 shadow-lg text-xs hover:bg-primary hover:text-white transition-colors"
                >
                    <action.icon className="w-3 h-3" />
                    {action.label}
                </button>
            ))}
        </div>

        {/* Glow effect */}
        <div className={`absolute bottom-0 left-0 right-0 h-[60px] rounded-xl blur opacity-20 transition duration-500 pointer-events-none ${agent.isListening ? 'bg-red-500 animate-pulse' : 'bg-white group-hover:opacity-30'}`}></div>
        
        <div className={`relative flex items-end gap-2 bg-background/80 backdrop-blur-2xl border border-white/10 rounded-xl p-2 shadow-2xl transition-all duration-300 ${agent.isListening ? 'ring-1 ring-red-500/50 bg-background/95' : ''}`}>
            <div className="flex flex-col items-center justify-end h-full py-1 pl-2">
                 {agent.isListening ? <Radio className="w-4 h-4 text-red-500 animate-pulse" /> : <Command className="w-4 h-4 text-muted-foreground/50" />}
            </div>

            <textarea
                ref={textareaRef}
                value={input || agent.transcript} 
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder={agent.isListening ? "Listening..." : "Ask Nexus..."}
                className="flex-1 max-h-[120px] min-h-[40px] bg-transparent border-none resize-none py-2.5 px-2 focus:outline-none text-sm placeholder:text-muted-foreground/50 font-sans leading-relaxed transition-all"
                rows={1}
            />
            
            <div className="flex items-center gap-1 pb-0.5">
                <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={toggleVoice}
                    className={`h-8 w-8 rounded-lg transition-all duration-300 ${
                        agent.isListening 
                        ? 'text-red-500 bg-red-500/10 hover:bg-red-500/20 shadow-inner' 
                        : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                    }`}
                >
                    {agent.isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </Button>
                
                <Button 
                    onClick={() => handleSubmit()} 
                    disabled={!input && !agent.transcript}
                    size="icon"
                    className="h-8 w-8 rounded-lg bg-white text-black hover:bg-white/90 disabled:opacity-50 disabled:bg-muted"
                >
                    {(input || agent.transcript) ? <Send className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                </Button>
            </div>
      </div>
    </div>
  );
}
