
import { mockTauri } from "./mockTauri";
import { ActionRequest } from "../types";

// Re-using the same interface class but routing to Tauri
export class AIService {
  static instance: AIService;

  constructor() { }

  static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  // Legacy client method - kept for signature compatibility but unused
  getClient() {
    return null;
  }

  // Track current subscriptions to clean up between messages
  private cleanupListeners: (() => void) | null = null;

  async sendMessage(
    message: string,
    onChunk: (chunk: string) => void,
    onAction?: (action: ActionRequest) => void,
    onKernelError?: (error: any) => void
  ) {
    try {
      console.log("📤 Sending to Rust Kernel:", message);

      // 1. Cleanup previous listeners
      if (this.cleanupListeners) {
        this.cleanupListeners();
        this.cleanupListeners = null;
      }

      // 2. Setup new listeners
      const unsubChunk = mockTauri.subscribeChunk((chunk) => {
        onChunk(chunk);
      });

      const unsubResponse = mockTauri.subscribeResponse((response) => {
        if (response.message_type === 'response' && response.data?.response) {
          // Ensure final full text is consistent if needed
        }

        if ((response.message_type === 'kernel_error' || response.message_type === 'error') && onKernelError) {
          const errorPayload = response.data || response.error || { error: "Unknown error" };
          // Normalize to what ChatInterface expects
          const normalized = typeof errorPayload === 'string' ? { error: errorPayload, type: 'Kernel Error' } : errorPayload;
          onKernelError(normalized);
        }

        // Handle Action/Tool Requests included in response or as separate events
        // Note: mockTauri handles 'tao_event' separately, but if we get a direct action request:
        if (response.message_type === 'action_request' && onAction) {
          onAction(response.data);
        }
      });

      const unsubHIL = mockTauri.subscribeHIL((action) => {
        if (onAction) onAction(action);
      });

      // bundling disposal
      this.cleanupListeners = () => {
        unsubChunk();
        unsubResponse();
        unsubHIL();
      };

      // 3. Send to Backend
      const response = await mockTauri.sendQuery(message) as any;

      if (!response?.success && onChunk) {
        // Graceful fallback message
        const errorMsg = response?.error || 'Kernel process not running.';
        onChunk(`The AI Kernel is currently unavailable. ${errorMsg}\n\nTo use AetherOS fully, ensure the Python kernel is running in WSL or as a background service.`);
      }

    } catch (error: any) {
      console.error("Kernel Bridge Error:", error);
      // Provide helpful user-facing message instead of raw error
      if (onChunk) {
        onChunk(`AetherOS requires the backend kernel to function. The kernel bridge is unreachable.\n\n**Quick Fixes:**\n1. Start the kernel manually: \`python kernel/main.py\`\n2. Check if Ollama is running: \`ollama serve\`\n3. Verify your firewall is not blocking localhost connections.`);
      }
    }
  }

  async summarize(context: any): Promise<string> {
    // TODO: Implement backend summarization endpoint
    return "Kernel Context: Active";
  }
}

export const aiService = AIService.getInstance();