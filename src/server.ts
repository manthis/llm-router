/**
 * LLM Router HTTP Server
 * 
 * Exposes an OpenAI-compatible API that routes to the appropriate model
 */

import Fastify, { FastifyInstance } from 'fastify';
import { LLMRouter } from './router.js';
import { RouterConfig, ChatCompletionRequest } from './types.js';

export async function createServer(config: RouterConfig): Promise<FastifyInstance> {
  const router = new LLMRouter(config);
  
  const app = Fastify({
    logger: config.debug,
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', version: '0.1.0' };
  });

  // Get router info
  app.get('/v1/router/info', async () => {
    const cfg = router.getConfig();
    return {
      defaultModel: {
        provider: cfg.defaultModel.provider,
        model: cfg.defaultModel.model,
      },
      powerModel: {
        provider: cfg.powerModel.provider,
        model: cfg.powerModel.model,
      },
      thresholds: cfg.thresholds,
    };
  });

  // List models (OpenAI-compatible)
  app.get('/v1/models', async () => {
    const cfg = router.getConfig();
    return {
      object: 'list',
      data: [
        {
          id: 'router',
          object: 'model',
          created: Date.now(),
          owned_by: 'llm-router',
        },
        {
          id: `${cfg.defaultModel.provider}/${cfg.defaultModel.model}`,
          object: 'model',
          created: Date.now(),
          owned_by: cfg.defaultModel.provider,
        },
        {
          id: `${cfg.powerModel.provider}/${cfg.powerModel.model}`,
          object: 'model',
          created: Date.now(),
          owned_by: cfg.powerModel.provider,
        },
      ],
    };
  });

  // Chat completions (OpenAI-compatible)
  app.post<{ Body: ChatCompletionRequest }>('/v1/chat/completions', async (request, reply) => {
    const body = request.body;

    if (!body.messages || !Array.isArray(body.messages)) {
      reply.code(400);
      return { error: { message: 'messages array is required', type: 'invalid_request_error' } };
    }

    // Handle streaming
    if (body.stream) {
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');

      try {
        for await (const chunk of router.routeStreamingRequest(body)) {
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reply.raw.write(`data: ${JSON.stringify({ error: { message } })}\n\n`);
        reply.raw.end();
      }
      
      return;
    }

    // Non-streaming
    try {
      const { response, tier, classification } = await router.routeRequest(body);
      
      if (config.debug) {
        console.log(`[Server] Request routed to ${tier} model (score: ${classification.score})`);
      }
      
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      reply.code(500);
      return { error: { message, type: 'api_error' } };
    }
  });

  return app;
}

export async function startServer(config: RouterConfig): Promise<FastifyInstance> {
  const app = await createServer(config);
  
  await app.listen({ port: config.port, host: config.host });
  
  console.log(`🚀 LLM Router listening on http://${config.host}:${config.port}`);
  console.log(`   Default: ${config.defaultModel.provider}/${config.defaultModel.model}`);
  console.log(`   Power:   ${config.powerModel.provider}/${config.powerModel.model}`);
  console.log(`   Threshold: score >= ${config.thresholds.minScoreForPower}`);
  
  return app;
}
