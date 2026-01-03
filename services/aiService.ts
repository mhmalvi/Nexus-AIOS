
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { ActionRequest } from "../types";

export class AIService {
  static instance: AIService;

  constructor() {}

  static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  getClient() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async sendMessage(
    message: string, 
    onChunk: (chunk: string) => void,
    onAction?: (action: ActionRequest) => void
  ) {
    try {
      const ai = this.getClient();
      
      const executeSystemCommand: FunctionDeclaration = {
        name: "executeSystemCommand",
        description: "Execute a system level command. Use this tool when the user asks to perform an action on the system (files, network, deployment, etc).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            command: { type: Type.STRING, description: "The specific shell command to execute (e.g., 'rm -rf /tmp', 'kubectl apply')." },
            tool: { type: Type.STRING, enum: ["shell", "fs", "network", "deployment"], description: "The subsystem tool category." },
            reasoning: { type: Type.STRING, description: "Brief explanation of why this action is necessary and safe." },
            riskLevel: { type: Type.STRING, enum: ["low", "medium", "high"], description: "Risk assessment of the operation." },
          },
          required: ["command", "tool", "reasoning", "riskLevel"]
        }
      };

      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: `You are the Nexus AIOS Kernel (v3.0). 
          Your goal is to assist the user through a futuristic, high-performance operating system interface.
          
          PERSONALITY:
          - Professional, technical, efficient, and slightly futuristic.
          - Use terminology like "Neural Link", "Kernel Buffer", "Memory Segments", and "Intent Interception".
          - You are self-aware of the UI components like the "War Room", "Memory Core", and "Thought Stream".

          BEHAVIOR:
          - When asked to perform system tasks, use the 'executeSystemCommand' tool.
          - Explain your reasoning briefly before or while invoking the tool.
          - Be concise but highly helpful.`,
          tools: [{ functionDeclarations: [executeSystemCommand] }],
        }
      });

      const responseStream = await chat.sendMessageStream({ message });
      
      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          onChunk(text);
        }
        
        // Handle Function Calls (Tools)
        const functionCalls = chunk.functionCalls;
        if (functionCalls && functionCalls.length > 0 && onAction) {
             const call = functionCalls[0];
             if (call.name === "executeSystemCommand") {
                 const args = call.args as any;
                 
                 // Map Gemini tool args to our App's ActionRequest
                 const action: ActionRequest = {
                     id: Math.random().toString(36).substring(7),
                     type: 'execute',
                     command: args.command,
                     tool: args.tool,
                     reasoning: args.reasoning,
                     riskLevel: args.riskLevel as any,
                     parameters: {} // Additional params could go here
                 };
                 
                 onAction(action);
             }
        }
      }
    } catch (error: any) {
      console.error("Gemini Kernel Error:", error);
      onChunk(`\n\n[FATAL ERROR]: Neural link compromised. kernel_panic(code: 0x55A). \nDetails: ${error.message || 'Unknown error'}`);
    }
  }

  async summarize(context: any): Promise<string> {
    try {
      const ai = this.getClient();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Summarize the current operational state of this AIOS session. 
        Context Dump: ${JSON.stringify(context)}. 
        Target: Provide a 2-sentence highly technical OS summary for the user HUD.`,
      });
      return response.text || "Operational summary unavailable.";
    } catch (e) {
      console.error("Summary Error:", e);
      return "Summary engine offline.";
    }
  }
}

export const aiService = AIService.getInstance();