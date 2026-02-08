/**
 * Message Complexity Classifier
 * 
 * Determines whether a request should use the default or power model
 * based on heuristics analyzing the message content.
 */

import { ChatMessage, ClassificationResult, ClassificationThresholds } from './types.js';

/** Keywords that suggest complex reasoning is needed */
const POWER_KEYWORDS = [
  // Architecture & Design
  'architect', 'architecture', 'design pattern', 'refactor', 'restructure',
  'scalab', 'microservice', 'distributed', 'system design',
  
  // Deep Analysis
  'analyze', 'analyse', 'debug', 'diagnose', 'investigate', 'root cause',
  'performance', 'optimize', 'bottleneck', 'memory leak',
  
  // Complex Coding
  'implement', 'algorithm', 'data structure', 'recursive', 'dynamic programming',
  'concurrency', 'async', 'thread', 'race condition', 'deadlock',
  'security', 'vulnerability', 'exploit', 'injection', 'authentication',
  
  // Multi-step Reasoning
  'step by step', 'walk me through', 'explain how', 'compare and contrast',
  'pros and cons', 'trade-off', 'tradeoff', 'best approach',
  
  // Research & Synthesis
  'research', 'synthesize', 'comprehensive', 'in-depth', 'thorough',
  'literature review', 'state of the art',
];

/** Keywords that suggest simple tasks (negative weight) */
const SIMPLE_KEYWORDS = [
  'hello', 'hi', 'thanks', 'thank you', 'ok', 'yes', 'no',
  'what time', 'weather', 'reminder', 'status', 'list',
  'send', 'message', 'email', 'check',
];

/** Programming languages often in complex requests */
const PROGRAMMING_LANGUAGES = [
  'typescript', 'javascript', 'python', 'rust', 'go', 'java',
  'c++', 'cpp', 'solidity', 'sql', 'graphql',
];

/**
 * Extract text content from messages
 */
export function extractTextContent(messages: ChatMessage[]): string {
  return messages
    .map((msg) => {
      if (typeof msg.content === 'string') {
        return msg.content;
      }
      if (Array.isArray(msg.content)) {
        return msg.content
          .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
          .map((part) => part.text)
          .join('\n');
      }
      return '';
    })
    .join('\n');
}

/**
 * Count lines of code in the text
 */
export function countCodeLines(text: string): number {
  // Match code blocks (```...```)
  const codeBlockRegex = /```[\s\S]*?```/g;
  const codeBlocks = text.match(codeBlockRegex) ?? [];
  
  let totalLines = 0;
  for (const block of codeBlocks) {
    // Remove the ``` markers and count lines
    const code = block.replace(/```\w*\n?/g, '').replace(/```$/g, '');
    totalLines += code.split('\n').filter((line) => line.trim().length > 0).length;
  }
  
  // Also count inline code patterns that look like multi-line code
  const inlineCodeLines = (text.match(/^[\t ]*(?:const|let|var|function|class|import|export|if|for|while|return|async|await)\b/gm) ?? []).length;
  
  return totalLines + inlineCodeLines;
}

/**
 * Count keyword matches (case-insensitive)
 */
export function countKeywordMatches(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase();
  return keywords.filter((kw) => lowerText.includes(kw.toLowerCase())).length;
}

/**
 * Detect if the request involves multiple steps or complex reasoning
 */
export function detectMultiStepReasoning(text: string): boolean {
  const patterns = [
    /first[\s,]+.*then/i,
    /step\s*\d/i,
    /\d+\.\s+\w+.*\n.*\d+\.\s+\w+/,
    /compare\s+\w+\s+(and|vs|versus|with)\s+\w+/i,
    /what\s+are\s+the\s+(differences?|similarities?)/i,
    /how\s+(would|should|can|do)\s+(you|i|we)\s+\w+.*\?/i,
  ];
  
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Detect error messages or debugging context
 */
export function detectDebugging(text: string): boolean {
  const patterns = [
    /error:/i,
    /exception:/i,
    /traceback/i,
    /stack\s*trace/i,
    /failed\s+to/i,
    /doesn't\s+work/i,
    /not\s+working/i,
    /bug\b/i,
    /fix\s+(this|the|my)/i,
  ];
  
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Calculate complexity score (0-100)
 */
export function calculateComplexityScore(text: string, thresholds: ClassificationThresholds): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;
  
  // Length factor (0-20 points)
  const length = text.length;
  if (length > thresholds.minLengthForPower) {
    const lengthScore = Math.min(20, Math.floor((length - thresholds.minLengthForPower) / 100));
    score += lengthScore;
    if (lengthScore > 5) signals.push(`long_message:${length}chars`);
  }
  
  // Code lines factor (0-25 points)
  const codeLines = countCodeLines(text);
  if (codeLines > thresholds.minCodeLinesForPower) {
    const codeScore = Math.min(25, Math.floor((codeLines - thresholds.minCodeLinesForPower) / 2));
    score += codeScore;
    signals.push(`code:${codeLines}lines`);
  } else if (codeLines > 10) {
    score += 5;
    signals.push(`code:${codeLines}lines`);
  }
  
  // Power keywords (0-30 points)
  const powerMatches = countKeywordMatches(text, POWER_KEYWORDS);
  if (powerMatches > 0) {
    const keywordScore = Math.min(30, powerMatches * 6);
    score += keywordScore;
    signals.push(`power_keywords:${powerMatches}`);
  }
  
  // Simple keywords (negative, -10 to 0)
  const simpleMatches = countKeywordMatches(text, SIMPLE_KEYWORDS);
  if (simpleMatches > 0 && powerMatches === 0) {
    score -= Math.min(10, simpleMatches * 3);
    signals.push(`simple_keywords:${simpleMatches}`);
  }
  
  // Multi-step reasoning (0-15 points)
  if (detectMultiStepReasoning(text)) {
    score += 15;
    signals.push('multi_step_reasoning');
  }
  
  // Debugging context (0-10 points)
  if (detectDebugging(text)) {
    score += 10;
    signals.push('debugging');
  }
  
  // Programming language mentions (0-5 points)
  const langMatches = countKeywordMatches(text, PROGRAMMING_LANGUAGES);
  if (langMatches > 0) {
    score += Math.min(5, langMatches * 2);
    signals.push(`programming:${langMatches}langs`);
  }
  
  // Question complexity (multiple questions = more complex)
  const questionCount = (text.match(/\?/g) ?? []).length;
  if (questionCount > 2) {
    score += Math.min(10, questionCount * 2);
    signals.push(`questions:${questionCount}`);
  }
  
  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));
  
  return { score, signals };
}

/**
 * Classify a request to determine which model tier to use
 */
export function classifyRequest(
  messages: ChatMessage[],
  thresholds: ClassificationThresholds
): ClassificationResult {
  // Extract all text content
  const text = extractTextContent(messages);
  
  // Get the last user message for primary classification
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const lastUserText = lastUserMessage ? extractTextContent([lastUserMessage]) : '';
  
  // Calculate scores for both full context and last message
  const { score: fullScore, signals: fullSignals } = calculateComplexityScore(text, thresholds);
  const { score: lastScore, signals: lastSignals } = calculateComplexityScore(lastUserText, thresholds);
  
  // Use the higher score (recent message might be simple but context is complex)
  const score = Math.max(fullScore, lastScore);
  const signals = score === fullScore ? fullSignals : lastSignals;
  
  const usePowerModel = score >= thresholds.minScoreForPower;
  
  let reason: string;
  if (usePowerModel) {
    reason = `Complexity score ${score} >= ${thresholds.minScoreForPower} (signals: ${signals.join(', ')})`;
  } else {
    reason = `Complexity score ${score} < ${thresholds.minScoreForPower} - using default model`;
  }
  
  return {
    usePowerModel,
    score,
    signals,
    reason,
  };
}
