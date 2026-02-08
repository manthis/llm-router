/**
 * LLM Router
 * 
 * Routes requests to the appropriate model based on classification
 */

import OpenAI from 'openai';
import { 
  ChatCompletionRequest, 
  ChatCompletionResponse, 
  ModelConfig, 
  RouterConfig,
  StreamChunk 
} from './types.js';
import { classifyRequest } from './classifier.js';

/**
 * Check if using direct Anthropic API (not a proxy)
 */
function isDirectAnthropic(config: ModelConfig): boolean {
  return config.provider === 'anthropic' && 
    config.baseUrl.includes('api.anthropic.com');
}

/**
 * Create an OpenAI-compatible client for a model config
 */
function createClient(config: ModelConfig): OpenAI {
  // For direct Anthropic, use their OpenAI-compatible endpoint
  // For proxies (like OpenClaw), use the configured baseUrl as-is
  let baseURL = config.baseUrl;
  if (isDirectAnthropic(config)) {
    baseURL = 'https://api.anthropic.com/v1';
  }
  
  return new OpenAI({
    apiKey: config.apiKey ?? 'not-required',
    baseURL,
    // Only add Anthropic headers for direct Anthropic access
    defaultHeaders: isDirectAnthropic(config)
      ? { 'anthropic-version': '2023-06-01' }
      : undefined,
  });
}

export class LLMRouter {
  private config: RouterConfig;
  private defaultClient: OpenAI;
  private powerClient: OpenAI;

  constructor(config: RouterConfig) {
    this.config = config;
    this.defaultClient = createClient(config.defaultModel);
    this.powerClient = createClient(config.powerModel);
  }

  /**
   * Route a chat completion request
   */
  async routeRequest(request: ChatCompletionRequest): Promise<{
    response: ChatCompletionResponse;
    tier: 'default' | 'power';
    classification: ReturnType<typeof classifyRequest>;
  }> {
    // Classify the request
    const classification = classifyRequest(request.messages, this.config.thresholds);
    
    if (this.config.debug) {
      console.log('[Router] Classification:', JSON.stringify(classification, null, 2));
    }

    const tier = classification.usePowerModel ? 'power' : 'default';
    const client = classification.usePowerModel ? this.powerClient : this.defaultClient;
    const modelConfig = classification.usePowerModel ? this.config.powerModel : this.config.defaultModel;

    try {
      const completion = await client.chat.completions.create({
        model: modelConfig.model,
        messages: request.messages as OpenAI.ChatCompletionMessageParam[],
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        stream: false,
      });

      const response: ChatCompletionResponse = {
        id: completion.id,
        object: 'chat.completion',
        created: completion.created,
        model: completion.model,
        choices: completion.choices.map((choice) => ({
          index: choice.index,
          message: {
            role: choice.message.role,
            content: choice.message.content ?? '',
          },
          finish_reason: choice.finish_reason as 'stop' | 'length' | 'tool_calls' | null,
        })),
        usage: completion.usage ? {
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
          total_tokens: completion.usage.total_tokens,
        } : undefined,
        _router: {
          tier,
          model: modelConfig.model,
          score: classification.score,
          signals: classification.signals,
        },
      };

      return { response, tier, classification };
    } catch (error) {
      // If default model fails, try power model as fallback
      if (tier === 'default' && error instanceof Error) {
        console.warn(`[Router] Default model failed: ${error.message}. Falling back to power model.`);
        
        const completion = await this.powerClient.chat.completions.create({
          model: this.config.powerModel.model,
          messages: request.messages as OpenAI.ChatCompletionMessageParam[],
          temperature: request.temperature,
          max_tokens: request.max_tokens,
          stream: false,
        });

        const response: ChatCompletionResponse = {
          id: completion.id,
          object: 'chat.completion',
          created: completion.created,
          model: completion.model,
          choices: completion.choices.map((choice) => ({
            index: choice.index,
            message: {
              role: choice.message.role,
              content: choice.message.content ?? '',
            },
            finish_reason: choice.finish_reason as 'stop' | 'length' | 'tool_calls' | null,
          })),
          usage: completion.usage ? {
            prompt_tokens: completion.usage.prompt_tokens,
            completion_tokens: completion.usage.completion_tokens,
            total_tokens: completion.usage.total_tokens,
          } : undefined,
          _router: {
            tier: 'power',
            model: this.config.powerModel.model,
            score: classification.score,
            signals: [...classification.signals, 'fallback_after_error'],
          },
        };

        return { response, tier: 'power', classification };
      }
      
      throw error;
    }
  }

  /**
   * Route a streaming chat completion request
   */
  async *routeStreamingRequest(request: ChatCompletionRequest): AsyncGenerator<StreamChunk> {
    // Classify the request
    const classification = classifyRequest(request.messages, this.config.thresholds);
    
    if (this.config.debug) {
      console.log('[Router] Classification (streaming):', JSON.stringify(classification, null, 2));
    }

    const client = classification.usePowerModel ? this.powerClient : this.defaultClient;
    const modelConfig = classification.usePowerModel ? this.config.powerModel : this.config.defaultModel;

    const stream = await client.chat.completions.create({
      model: modelConfig.model,
      messages: request.messages as OpenAI.ChatCompletionMessageParam[],
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      stream: true,
    });

    for await (const chunk of stream) {
      yield {
        id: chunk.id,
        object: 'chat.completion.chunk',
        created: chunk.created,
        model: chunk.model,
        choices: chunk.choices.map((choice) => ({
          index: choice.index,
          delta: {
            role: choice.delta.role as 'assistant' | undefined,
            content: choice.delta.content ?? undefined,
          },
          finish_reason: choice.finish_reason as 'stop' | 'length' | 'tool_calls' | null,
        })),
      };
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): RouterConfig {
    return this.config;
  }
}
