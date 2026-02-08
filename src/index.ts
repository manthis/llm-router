/**
 * LLM Router - Entry Point
 * 
 * Smart LLM router that uses local models by default
 * and escalates to powerful models when needed.
 */

import 'dotenv/config';
import { loadConfig, validateConfig } from './config.js';
import { startServer } from './server.js';

async function main() {
  console.log('🔧 LLM Router v0.1.0');
  console.log('');

  // Load configuration
  const config = loadConfig();

  // Validate configuration
  const errors = validateConfig(config);
  if (errors.length > 0) {
    console.error('❌ Configuration errors:');
    errors.forEach((err) => console.error(`   - ${err}`));
    process.exit(1);
  }

  // Start server
  try {
    await startServer(config);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

main();

// Export for testing
export { loadConfig, validateConfig } from './config.js';
export { classifyRequest, calculateComplexityScore, extractTextContent, countCodeLines } from './classifier.js';
export { LLMRouter } from './router.js';
export { createServer, startServer } from './server.js';
export * from './types.js';
