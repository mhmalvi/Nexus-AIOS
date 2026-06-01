/**
 * Global Model Config store.
 *
 * A tiny external store (React useSyncExternalStore) that holds the active
 * model / provider / keys so EVERY surface — StatusBar, Module Manager,
 * Provider panel — reads one source of truth and updates instantly when any
 * of them changes it. All mutations persist to the kernel via systemApi and
 * then notify subscribers globally.
 */
import { useSyncExternalStore } from 'react';
import { systemApi, kernelApi } from './tauriApi';

export interface ModelConfigState {
    activeModel: string;            // local (Ollama) chat model = config.default_model
    aiProvider: string;             // 'ollama' or a cloud provider id
    providerModels: Record<string, string>; // per-provider model overrides
    providersWithKeys: string[];    // providers that have an API key set
    installedModels: string[];      // installed Ollama model names
    loaded: boolean;
}

let state: ModelConfigState = {
    activeModel: '',
    aiProvider: 'ollama',
    providerModels: {},
    providersWithKeys: [],
    installedModels: [],
    loaded: false,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const patch = (p: Partial<ModelConfigState>) => { state = { ...state, ...p }; emit(); };

let refreshing = false;

export const modelConfig = {
    get: (): ModelConfigState => state,
    subscribe: (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; },

    /** Pull the latest config + installed models from the kernel. */
    async refresh(): Promise<void> {
        if (refreshing) return;
        refreshing = true;
        try {
            try {
                const cfg = await systemApi.getConfig();
                const d = cfg?.data || {};
                patch({
                    activeModel: d.default_model ?? state.activeModel,
                    aiProvider: d.ai_provider ?? state.aiProvider,
                    providerModels: (d.provider_models && typeof d.provider_models === 'object') ? d.provider_models : state.providerModels,
                    providersWithKeys: Array.isArray(d.providers_with_keys) ? d.providers_with_keys : state.providersWithKeys,
                    loaded: true,
                });
            } catch { /* browser mode / kernel not ready */ }
            try {
                const models = await kernelApi.listModels();
                if (Array.isArray(models)) patch({ installedModels: models });
            } catch { /* ignore */ }
        } finally {
            refreshing = false;
        }
    },

    /** Set the active LOCAL (Ollama) chat model — persists + global update. */
    async setLocalModel(model: string): Promise<void> {
        if (!model || model === state.activeModel) return;
        patch({ activeModel: model, providerModels: { ...state.providerModels, ollama: model } });
        await systemApi.updateConfig({ default_model: model, provider_models: { ollama: model } });
    },

    /** Switch the preferred provider (e.g. 'ollama', 'gemini'). */
    async setProvider(provider: string): Promise<void> {
        if (provider === state.aiProvider) return;
        patch({ aiProvider: provider });
        await systemApi.updateConfig({ ai_provider: provider });
    },

    /** Override the model used for a given provider. */
    async setProviderModel(provider: string, model: string): Promise<void> {
        const trimmed = model.trim();
        if (trimmed === (state.providerModels[provider] || '')) return;
        patch({ providerModels: { ...state.providerModels, [provider]: trimmed } });
        await systemApi.updateConfig({ provider_models: { [provider]: trimmed } });
    },

    /** Save an API key for a provider. */
    async saveKey(provider: string, key: string): Promise<void> {
        await systemApi.updateConfig({ api_keys: { [provider]: key } });
        if (!state.providersWithKeys.includes(provider)) {
            patch({ providersWithKeys: [...state.providersWithKeys, provider] });
        }
    },
};

/** Provider default models (used when no per-provider override is set). */
export const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
    ollama: 'llama3.2:3b',
    groq: 'llama-3.3-70b-versatile',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-sonnet-4-20250514',
    cerebras: 'llama-3.3-70b',
    mistral: 'mistral-small-latest',
    gemini: 'gemini-2.0-flash',
    openrouter: 'meta-llama/llama-3.3-70b-instruct',
};

/** Curated current model IDs per cloud provider (users can also enter a custom ID). */
export const PROVIDER_MODEL_CATALOG: Record<string, string[]> = {
    groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'deepseek-r1-distill-llama-70b', 'qwen-2.5-32b'],
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini', 'o3-mini'],
    anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'],
    cerebras: ['llama-3.3-70b', 'llama3.1-8b', 'qwen-3-32b'],
    mistral: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
    gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    openrouter: ['meta-llama/llama-3.3-70b-instruct', 'anthropic/claude-3.7-sonnet', 'google/gemini-2.0-flash-001', 'openai/gpt-4o-mini'],
};

/** The model that will actually be used for chat, given the active provider. */
export function effectiveModel(s: ModelConfigState): string {
    if (s.aiProvider === 'ollama') return s.activeModel || PROVIDER_DEFAULT_MODEL.ollama;
    return s.providerModels[s.aiProvider] || PROVIDER_DEFAULT_MODEL[s.aiProvider] || s.aiProvider;
}

/** Short label for the active provider (LOCAL / AUTO / provider name). */
export function providerLabel(provider: string): string {
    if (provider === 'ollama') return 'LOCAL';
    if (provider === 'auto') return 'AUTO';
    return provider.toUpperCase();
}

/** React hook — components re-render whenever the global model config changes. */
export function useModelConfig(): ModelConfigState {
    return useSyncExternalStore(modelConfig.subscribe, modelConfig.get, modelConfig.get);
}
