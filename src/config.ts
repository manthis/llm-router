/**
 * LLM Router Configuration
 */

import { RouterConfig } from './types.js';

/**
 * Load configuration from environment variables with defaults
 */
export function loadConfig(): RouterConfig {
  return {
    port: parseInt(process.env.ROUTER_PORT ?? '5555', 10),
    host: process.env.ROUTER_HOST ?? '127.0.0.1',
    debug: process.env.ROUTER_DEBUG === 'true',

    defaultModel: {
      provider: (process.env.DEFAULT_PROVIDER as 'ollama' | 'anthropic' | 'openai') ?? 'ollama',
      model: process.env.DEFAULT_MODEL ?? 'qwen3:14b',
      baseUrl: process.env.DEFAULT_BASE_URL ?? 'http://localhost:11434/v1',
      apiKey: process.env.DEFAULT_API_KEY,
    },

    powerModel: {
      provider: (process.env.POWER_PROVIDER as 'ollama' | 'anthropic' | 'openai') ?? 'anthropic',
      model: process.env.POWER_MODEL ?? 'claude-opus-4-5-20250205',
      baseUrl: process.env.POWER_BASE_URL ?? 'https://api.anthropic.com',
      apiKey: process.env.POWER_API_KEY ?? process.env.ANTHROPIC_API_KEY,
    },

    thresholds: {
      minLengthForPower: parseInt(process.env.THRESHOLD_MIN_LENGTH ?? '500', 10),
      minCodeLinesForPower: parseInt(process.env.THRESHOLD_MIN_CODE_LINES ?? '30', 10),
      minScoreForPower: parseInt(process.env.THRESHOLD_MIN_SCORE ?? '50', 10),
    },
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: RouterConfig): string[] {
  const errors: string[] = [];

  if (config.port < 1 || config.port > 65535) {
    errors.push('Port must be between 1 and 65535');
  }

  if (!config.defaultModel.baseUrl) {
    errors.push('Default model base URL is required');
  }

  if (!config.powerModel.baseUrl) {
    errors.push('Power model base URL is required');
  }

  if (config.powerModel.provider === 'anthropic' && !config.powerModel.apiKey) {
    errors.push('Power model API key is required for Anthropic');
  }

  if (config.powerModel.provider === 'openai' && !config.powerModel.apiKey) {
    errors.push('Power model API key is required for OpenAI');
  }

  return errors;
}
