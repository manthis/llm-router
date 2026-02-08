/**
 * Server E2E Tests
 * 
 * These tests require Ollama to be running locally.
 * Run with: pnpm test:e2e
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from './server.js';
import { RouterConfig } from './types.js';

const testConfig: RouterConfig = {
  port: 5556,
  host: '127.0.0.1',
  debug: false,
  defaultModel: {
    provider: 'ollama',
    model: 'qwen3:14b',
    baseUrl: 'http://localhost:11434/v1',
  },
  powerModel: {
    provider: 'ollama', // Use Ollama for both in tests to avoid API costs
    model: 'qwen3:14b',
    baseUrl: 'http://localhost:11434/v1',
  },
  thresholds: {
    minLengthForPower: 500,
    minCodeLinesForPower: 30,
    minScoreForPower: 50,
  },
};

describe('Server E2E', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createServer(testConfig);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.version).toBe('0.1.0');
    });
  });

  describe('GET /v1/router/info', () => {
    it('should return router configuration', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/router/info',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.defaultModel).toBeDefined();
      expect(body.powerModel).toBeDefined();
      expect(body.thresholds).toBeDefined();
    });
  });

  describe('GET /v1/models', () => {
    it('should return available models', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/models',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.object).toBe('list');
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /v1/chat/completions', () => {
    it('should reject requests without messages', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it('should handle simple requests (routes to default)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          messages: [
            { role: 'user', content: 'Say "hello" and nothing else.' },
          ],
          max_tokens: 10,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.choices).toBeDefined();
      expect(body.choices[0].message.content).toBeDefined();
      expect(body._router).toBeDefined();
      expect(body._router.tier).toBe('default');
    });

    it('should handle complex requests (routes to power)', async () => {
      const complexCode = Array(50).fill('async function process() { await db.query(); }').join('\n');
      
      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          messages: [
            {
              role: 'user',
              content: `
Refactor this architecture and debug the performance bottlenecks.
First analyze, then optimize the distributed microservices.
\`\`\`typescript
${complexCode}
\`\`\`
              `,
            },
          ],
          max_tokens: 50,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.choices).toBeDefined();
      expect(body._router).toBeDefined();
      expect(body._router.tier).toBe('power');
      expect(body._router.score).toBeGreaterThanOrEqual(50);
    });
  });
});
