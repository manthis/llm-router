/**
 * LLM Router Types
 */

export interface RouterConfig {
  /** Port to listen on */
  port: number;
  /** Host to bind to */
  host: string;
  /** Default model for simple requests */
  defaultModel: ModelConfig;
  /** Power model for complex requests */
  powerModel: ModelConfig;
  /** Classification thresholds */
  thresholds: ClassificationThresholds;
  /** Enable debug logging */
  debug: boolean;
}

export interface ModelConfig {
  /** Provider name (ollama, anthropic, openai) */
  provider: 'ollama' | 'anthropic' | 'openai';
  /** Model identifier */
  model: string;
  /** Base URL for the API */
  baseUrl: string;
  /** API key (if required) */
  apiKey?: string;
}

export interface ClassificationThresholds {
  /** Minimum message length to consider for power model */
  minLengthForPower: number;
  /** Minimum code lines to trigger power model */
  minCodeLinesForPower: number;
  /** Minimum complexity score to trigger power model */
  minScoreForPower: number;
}

export interface ClassificationResult {
  /** Whether to use power model */
  usePowerModel: boolean;
  /** Complexity score (0-100) */
  score: number;
  /** Signals that contributed to the score */
  signals: string[];
  /** Reasoning for the decision */
  reason: string;
}

export interface ChatCompletionRequest {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  [key: string]: unknown;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  name?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  /** Custom field: which model tier was used */
  _router?: {
    tier: 'default' | 'power';
    model: string;
    score: number;
    signals: string[];
  };
}

export interface ChatChoice {
  index: number;
  message: ChatMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | null;
}

export interface StreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: StreamChoice[];
}

export interface StreamChoice {
  index: number;
  delta: Partial<ChatMessage>;
  finish_reason: 'stop' | 'length' | 'tool_calls' | null;
}
