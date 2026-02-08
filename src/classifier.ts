/**
 * Message Complexity Classifier
 * 
 * Determines whether a request should use the default or power model
 * based on heuristics analyzing the message content.
 */

import { ChatMessage, ClassificationResult, ClassificationThresholds } from './types.js';

/** Keywords that suggest complex reasoning is needed (English + French) */
const POWER_KEYWORDS = [
  // Architecture & Design
  'architect', 'architecture', 'design pattern', 'refactor', 'restructure',
  'scalab', 'microservice', 'distributed', 'system design',
  'restructurer', 'conception',
  
  // Deep Analysis (EN)
  'analyze', 'analyse', 'debug', 'diagnose', 'investigate', 'root cause',
  'performance', 'optimize', 'bottleneck', 'memory leak',
  // Deep Analysis (FR)
  'analyser', 'débugger', 'diagnostiquer', 'enquêter', 'cause racine',
  'optimiser', 'goulot', 'fuite mémoire',
  
  // Complex Coding
  'implement', 'algorithm', 'data structure', 'recursive', 'dynamic programming',
  'concurrency', 'async', 'thread', 'race condition', 'deadlock',
  'security', 'vulnerability', 'exploit', 'injection', 'authentication',
  'implémenter', 'algorithme', 'structure de données', 'récursif', 'programmation dynamique',
  'concurrence', 'authentification', 'vulnérabilité',
  
  // Multi-step Reasoning (EN)
  'step by step', 'walk me through', 'explain how', 'compare and contrast',
  'pros and cons', 'trade-off', 'tradeoff', 'best approach',
  // Multi-step Reasoning (FR)
  'étape par étape', 'explique-moi', 'explique moi', 'comment fonctionne',
  'compare', 'avantages et inconvénients', 'pour et contre', 'meilleure approche',
  
  // Explanation requests (EN)
  'explain', 'describe', 'elaborate', 'summarize', 'summary',
  // Explanation requests (FR)
  'explique', 'expliquer', 'décris', 'décrire', 'résume', 'résumer', 'résumé',
  
  // Why/How questions (EN)
  'why does', 'why is', 'how does', 'how do', 'how can',
  // Why/How questions (FR)
  'pourquoi', 'comment faire', 'comment est-ce',
  
  // Research & Synthesis
  'research', 'synthesize', 'comprehensive', 'in-depth', 'thorough',
  'literature review', 'state of the art',
  'recherche', 'synthétiser', 'approfondi', 'complet',
];

/** Keywords that suggest simple tasks (negative weight) - English + French */
const SIMPLE_KEYWORDS = [
  // Greetings (EN)
  'hello', 'hi', 'thanks', 'thank you', 'ok', 'yes', 'no',
  // Greetings (FR)
  'salut', 'bonjour', 'coucou', 'merci', 'oui', 'non', 'ça va', 'ca va',
  
  // Simple tasks (EN)
  'what time', 'weather', 'reminder', 'status', 'list',
  'send', 'message', 'email', 'check',
  // Simple tasks (FR)
  'quelle heure', 'météo', 'meteo', 'rappel', 'statut', 'liste',
  'envoie', 'envoyer', 'message', 'mail', 'vérifie', 'vérifier',
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
 * Detect if the request involves multiple steps or complex reasoning (EN + FR)
 */
export function detectMultiStepReasoning(text: string): boolean {
  const patterns = [
    // English patterns
    /first[\s,]+.*then/i,
    /step\s*\d/i,
    /\d+\.\s+\w+.*\n.*\d+\.\s+\w+/,
    /compare\s+\w+\s+(and|vs|versus|with)\s+\w+/i,
    /what\s+are\s+the\s+(differences?|similarities?)/i,
    /how\s+(would|should|can|do)\s+(you|i|we)\s+\w+.*\?/i,
    
    // French patterns
    /d'abord[\s,]+.*ensuite/i,
    /premi[èe]rement[\s,]+.*puis/i,
    /étape\s*\d/i,
    /compare[rz]?\s+\w+\s+(et|avec|à|vs)\s+\w+/i,
    /quelles?\s+(sont|est)\s+(les?\s+)?(différences?|similitudes?)/i,
    /comment\s+(puis-je|peut-on|faire|est-ce)/i,
    /explique[\s-]*(moi|nous)?/i,
    /pourquoi\s+(est-ce|faut-il|ne\s+pas)/i,
    // Additional French command patterns for complex requests
    /r[ée]sume[\s-]*(moi|nous)?/i,
    /analyse[\s-]*(moi|nous)?\s+(ce|le|la|les|cet)/i,
    /d[ée]cris[\s-]*(moi|nous)?/i,
    /aide[\s-]*(moi|nous)?\s+[àa]\s+(comprendre|d[ée]bugger|analyser|r[ée]soudre|trouver)/i,
    /help\s+me\s+(understand|debug|analyze|fix|find|solve)/i,
  ];
  
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Detect error messages or debugging context (EN + FR)
 */
export function detectDebugging(text: string): boolean {
  const patterns = [
    // English patterns
    /error:/i,
    /exception:/i,
    /traceback/i,
    /stack\s*trace/i,
    /failed\s+to/i,
    /doesn't\s+work/i,
    /not\s+working/i,
    /bug\b/i,
    /fix\s+(this|the|my)/i,
    
    // French patterns
    /erreur\s*:/i,
    /ne\s+(fonctionne|marche)\s+(pas|plus)/i,
    /ça\s+(ne\s+)?(fonctionne|marche)\s+(pas|plus)/i,
    /corrige[rz]?\s+(ce|le|mon|cette|la|ma)/i,
    /répare[rz]?\s+(ce|le|mon|cette|la|ma)/i,
    /problème\s+(avec|de|dans)/i,
    /échoue\s+à/i,
    /a\s+échoué/i,
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
  
  // Power keywords (0-40 points) - weighted higher for complex reasoning signals
  const powerMatches = countKeywordMatches(text, POWER_KEYWORDS);
  if (powerMatches > 0) {
    const keywordScore = Math.min(40, powerMatches * 10);
    score += keywordScore;
    signals.push(`power_keywords:${powerMatches}`);
  }
  
  // Simple keywords (negative, -10 to 0)
  const simpleMatches = countKeywordMatches(text, SIMPLE_KEYWORDS);
  if (simpleMatches > 0 && powerMatches === 0) {
    score -= Math.min(10, simpleMatches * 3);
    signals.push(`simple_keywords:${simpleMatches}`);
  }
  
  // Multi-step reasoning (0-30 points)
  if (detectMultiStepReasoning(text)) {
    score += 30;
    signals.push('multi_step_reasoning');
  }
  
  // Debugging context (0-25 points)
  if (detectDebugging(text)) {
    score += 25;
    signals.push('debugging');
  }
  
  // Deep reasoning questions (0-15 points) - EN + FR
  const deepQuestionPatterns = [
    /\b(why|pourquoi)\b.*\?/i,
    /\bhow\s+(does|do|can|could|would|is|are)\b.*\?/i,
    /\bwhat\s+(is|are)\s+the\s+(difference|reason|cause|mechanism)/i,
    /\bqu'?est[- ]ce\s+que?\b/i,
    /\bcomment\s+(ça|cela)?\s*(fonctionne|marche)/i,
  ];
  if (deepQuestionPatterns.some((p) => p.test(text)) && text.length > 30) {
    score += 15;
    signals.push('deep_question');
  }
  
  // Academic/theoretical topics (0-15 points) - EN + FR
  const academicPatterns = [
    /\b(theory|theorem|principle|concept|hypothesis)\b/i,
    /\b(théorie|théorème|principe|concept|hypothèse)\b/i,
    /\b(quantum|relativity|physics|mathematics|philosophy)\b/i,
    /\b(quantique|relativité|physique|mathématiques?|philosophie)\b/i,
    /\b(mécanique|thermodynamique|électromagnétisme)\b/i,
  ];
  if (academicPatterns.some((p) => p.test(text))) {
    score += 15;
    signals.push('academic_topic');
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
