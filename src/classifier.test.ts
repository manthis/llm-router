/**
 * Classifier Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  extractTextContent,
  countCodeLines,
  countKeywordMatches,
  detectMultiStepReasoning,
  detectDebugging,
  calculateComplexityScore,
  classifyRequest,
} from './classifier.js';
import { ChatMessage, ClassificationThresholds } from './types.js';

const defaultThresholds: ClassificationThresholds = {
  minLengthForPower: 500,
  minCodeLinesForPower: 30,
  minScoreForPower: 50,
};

describe('extractTextContent', () => {
  it('should extract text from simple messages', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello world' },
      { role: 'assistant', content: 'Hi there!' },
    ];
    const result = extractTextContent(messages);
    expect(result).toBe('Hello world\nHi there!');
  });

  it('should extract text from content arrays', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this image' },
          { type: 'image_url', image_url: { url: 'http://example.com/img.png' } },
        ],
      },
    ];
    const result = extractTextContent(messages);
    expect(result).toBe('Check this image');
  });
});

describe('countCodeLines', () => {
  it('should count lines in code blocks', () => {
    const text = `
Here is some code:
\`\`\`typescript
function hello() {
  console.log('world');
}
\`\`\`
    `;
    const result = countCodeLines(text);
    expect(result).toBeGreaterThanOrEqual(3);
  });

  it('should count lines in multiple code blocks', () => {
    const text = `
\`\`\`js
const a = 1;
const b = 2;
\`\`\`

And more:

\`\`\`python
def foo():
    return 42
\`\`\`
    `;
    const result = countCodeLines(text);
    expect(result).toBeGreaterThanOrEqual(4);
  });

  it('should return 0 for no code', () => {
    const text = 'Just some regular text without any code.';
    const result = countCodeLines(text);
    expect(result).toBe(0);
  });
});

describe('countKeywordMatches', () => {
  it('should count matching keywords', () => {
    const text = 'I need to refactor the architecture and debug this issue';
    const keywords = ['refactor', 'architecture', 'debug', 'optimize'];
    const result = countKeywordMatches(text, keywords);
    expect(result).toBe(3);
  });

  it('should be case-insensitive', () => {
    const text = 'REFACTOR the Architecture';
    const keywords = ['refactor', 'architecture'];
    const result = countKeywordMatches(text, keywords);
    expect(result).toBe(2);
  });

  it('should return 0 for no matches', () => {
    const text = 'Hello world';
    const keywords = ['refactor', 'debug'];
    const result = countKeywordMatches(text, keywords);
    expect(result).toBe(0);
  });
});

describe('detectMultiStepReasoning', () => {
  it('should detect "first...then" patterns', () => {
    expect(detectMultiStepReasoning('First we need to analyze, then implement')).toBe(true);
  });

  it('should detect step numbers', () => {
    expect(detectMultiStepReasoning('Step 1: Do this')).toBe(true);
  });

  it('should detect comparison questions', () => {
    expect(detectMultiStepReasoning('Compare React and Vue')).toBe(true);
  });

  it('should return false for simple text', () => {
    expect(detectMultiStepReasoning('Hello world')).toBe(false);
  });
});

describe('detectDebugging', () => {
  it('should detect error messages', () => {
    expect(detectDebugging('Error: Cannot read property of undefined')).toBe(true);
  });

  it('should detect "not working" phrases', () => {
    expect(detectDebugging('My code is not working')).toBe(true);
  });

  it('should detect "fix" requests', () => {
    expect(detectDebugging('Can you fix this bug?')).toBe(true);
  });

  it('should return false for non-debugging text', () => {
    expect(detectDebugging('Create a new function')).toBe(false);
  });
});

describe('calculateComplexityScore', () => {
  it('should give low score for simple messages', () => {
    const text = 'Hello, how are you?';
    const { score } = calculateComplexityScore(text, defaultThresholds);
    expect(score).toBeLessThan(30);
  });

  it('should give high score for complex messages', () => {
    const text = `
I need to refactor the architecture of our microservices system.
We have performance issues and need to debug the bottlenecks.
First, analyze the current state, then propose a new design.
Here's the current code:
\`\`\`typescript
${Array(40).fill('const x = 1;').join('\n')}
\`\`\`
    `;
    const { score, signals } = calculateComplexityScore(text, defaultThresholds);
    expect(score).toBeGreaterThanOrEqual(50);
    expect(signals.some(s => s.startsWith('power_keywords:'))).toBe(true);
    expect(signals.some(s => s.startsWith('code:'))).toBe(true);
  });

  it('should detect power keywords', () => {
    const text = 'Help me architect a distributed system with good scalability';
    const { signals } = calculateComplexityScore(text, defaultThresholds);
    expect(signals.some(s => s.startsWith('power_keywords:'))).toBe(true);
  });
});

describe('classifyRequest', () => {
  it('should use default model for simple requests', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'What time is it?' },
    ];
    const result = classifyRequest(messages, defaultThresholds);
    expect(result.usePowerModel).toBe(false);
    expect(result.score).toBeLessThan(50);
  });

  it('should use power model for complex requests', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: `
Please help me refactor this complex architecture.
I need to debug performance issues in our distributed microservices.
First, analyze the bottlenecks, then propose optimizations.
Here is the current implementation:
\`\`\`typescript
${Array(50).fill('async function complexOperation() { await db.query(); }').join('\n')}
\`\`\`
        `,
      },
    ];
    const result = classifyRequest(messages, defaultThresholds);
    expect(result.usePowerModel).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(50);
  });

  it('should consider full conversation context', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'I need help with a complex architecture problem to refactor and debug' },
      { role: 'assistant', content: 'Sure, tell me more about your distributed microservices system' },
      {
        role: 'user',
        content: `
Here's my microservices setup with performance bottlenecks to analyze:
\`\`\`typescript
${Array(40).fill('async function processRequest() { await db.query(); }').join('\n')}
\`\`\`
        `,
      },
    ];
    const result = classifyRequest(messages, defaultThresholds);
    expect(result.usePowerModel).toBe(true);
  });
});
