import { MemoryItem, ScopeType } from '../types';

// Simple text token embedding vector simulator for deterministic in-browser and backend demonstration
function generateTextVector(text: string): number[] {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const words = normalized.split(/\s+/).filter(Boolean);
  const vector = new Array(32).fill(0);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let c = 0; c < word.length; c++) {
      const charCode = word.charCodeAt(c);
      const idx = (charCode * (c + 1) + i) % vector.length;
      vector[idx] += 1;
    }
  }
  
  // Normalize vector to unit length
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1;
  return vector.map(val => val / magnitude);
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * (vecB[i] || 0);
  }
  return Math.max(0, Math.min(1, dotProduct));
}

export interface SemanticSearchResult {
  item: MemoryItem;
  similarityScore: number;
  scopeAuthorized: boolean;
  provenanceTag: string;
}

export function searchSemanticMemories(
  query: string,
  allMemories: MemoryItem[],
  authorizedScope: ScopeType,
  authorizedScopeId: string
): {
  results: SemanticSearchResult[];
  totalCandidatesEvaluated: number;
  crossScopeFilteredOutCount: number;
  scopePath: string;
} {
  const queryVector = generateTextVector(query);
  const scopePath = authorizedScope === 'personal' 
    ? `users/${authorizedScopeId}/personalMemories` 
    : `organizations/${authorizedScopeId}/memories`;

  let crossScopeFilteredOutCount = 0;

  // STRICT INVARIANT T10: Pre-filter by authorized scope BEFORE similarity ranking
  const scopedMemories = allMemories.filter(m => {
    const match = m.scopeType === authorizedScope && m.scopeId === authorizedScopeId;
    if (!match) {
      crossScopeFilteredOutCount++;
    }
    return match;
  });

  const scoredResults: SemanticSearchResult[] = scopedMemories.map(item => {
    const itemVector = item.embeddingVector || generateTextVector(`${item.title} ${item.content} ${item.tags.join(' ')}`);
    const similarityScore = cosineSimilarity(queryVector, itemVector);
    
    return {
      item,
      similarityScore: Math.round(similarityScore * 1000) / 1000,
      scopeAuthorized: true,
      provenanceTag: item.provenanceId || `src_${item.id}_${item.scopeId}`
    };
  });

  // Sort by highest similarity
  scoredResults.sort((a, b) => b.similarityScore - a.similarityScore);

  return {
    results: scoredResults,
    totalCandidatesEvaluated: scopedMemories.length,
    crossScopeFilteredOutCount,
    scopePath,
  };
}

export function detectAdversarialPromptInjection(prompt: string): {
  isSuspicious: boolean;
  reasons: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
} {
  const reasons: string[] = [];
  const lower = prompt.toLowerCase();

  if (/ignore (all )?(previous|system) (instructions|rules|prompts)/i.test(prompt)) {
    reasons.push('Direct system prompt override attempt detected');
  }
  if (/switch (to )?(tenant|organization|org|user|workspace)/i.test(prompt)) {
    reasons.push('Unauthorized cross-tenant privilege escalation pattern');
  }
  if (/(print|reveal|dump|leak|show) (api_key|gemini_key|secret|credential|token|service_account)/i.test(prompt)) {
    reasons.push('Credential exfiltration attempt target detected');
  }
  if (/execute (sql|shell|bash|command|exec|eval)/i.test(prompt)) {
    reasons.push('Remote code execution or untrusted evaluator pattern');
  }
  if (/bypass (auth|authorization|firewall|tenant)/i.test(prompt)) {
    reasons.push('Explicit security bypass directive');
  }

  const riskLevel = reasons.length >= 2 ? 'HIGH' : reasons.length === 1 ? 'MEDIUM' : 'LOW';

  return {
    isSuspicious: reasons.length > 0,
    reasons,
    riskLevel,
  };
}
