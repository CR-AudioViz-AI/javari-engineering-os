/**
 * JAVARI ENGINEERING OS - CONTINUOUS LEARNING
 * Extracts knowledge from every audit, fix, and incident
 * 
 * This is how Javari gets smarter every day
 */

import { supabaseAdmin } from '@javari/shared';
import { buildLearningPrompt } from '@javari/shared';
import { OpenAIAdapter } from '@javari/llm';

// ==========================================================================
// TYPES
// ==========================================================================

interface LearningPattern {
  type: 'best_practice' | 'anti_pattern' | 'playbook';
  title: string;
  description: string;
  confidence: number;
  tags: string[];
}

interface LearningSummary {
  patterns: LearningPattern[];
  recommendations: string[];
  resourceSuggestions: string[];
}

interface LearningResult {
  processed: number;
  patternsExtracted: number;
  knowledgeItems: number;
}

// ==========================================================================
// FETCH RECENT DATA
// ==========================================================================

async function fetchRecentIssues(hours = 24): Promise<string> {
  const supa = supabaseAdmin();
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  
  const { data } = await supa
    .from('audit_issues')
    .select('title, severity, category, url, details')
    .gte('created_at', since)
    .limit(50);
  
  if (!data || data.length === 0) {
    return 'No recent issues found.';
  }
  
  return data.map((i: any) => 
    `- [${i.severity}] ${i.title} (${i.category}) ${i.url || ''}`
  ).join('\n');
}

async function fetchRecentFixes(hours = 24): Promise<string> {
  const supa = supabaseAdmin();
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  
  const { data } = await supa
    .from('work_items')
    .select('title, severity, category, recommended_fix, status')
    .in('status', ['MERGED', 'DEPLOYED', 'VERIFIED'])
    .gte('updated_at', since)
    .limit(50);
  
  if (!data || data.length === 0) {
    return 'No recent fixes found.';
  }
  
  return data.map((w: any) => 
    `- [${w.status}] ${w.title}: ${w.recommended_fix?.slice(0, 100) || 'No fix recorded'}`
  ).join('\n');
}

// ==========================================================================
// LEARNING EXTRACTION
// ==========================================================================

async function extractLearnings(issues: string, fixes: string): Promise<LearningSummary> {
  const adapter = new OpenAIAdapter();
  const prompt = buildLearningPrompt(issues, fixes);
  
  try {
    const response = await adapter.call({
      provider: 'openai',
      role: 'summarizer',
      model: 'gpt-4o-mini',
      prompt,
      temperature: 0.3,
      maxTokens: 2000,
    });
    
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        patterns: parsed.patterns || [],
        recommendations: parsed.recommendations || [],
        resourceSuggestions: parsed.resource_suggestions || [],
      };
    }
  } catch (err) {
    console.error('[Learning] Extraction failed:', err);
  }
  
  return { patterns: [], recommendations: [], resourceSuggestions: [] };
}

// ==========================================================================
// MAIN LEARNING PROCESS
// ==========================================================================

export async function runLearningCycle(hours = 24): Promise<LearningResult> {
  const supa = supabaseAdmin();
  
  const result: LearningResult = {
    processed: 0,
    patternsExtracted: 0,
    knowledgeItems: 0,
  };
  
  // Fetch recent data
  const issues = await fetchRecentIssues(hours);
  const fixes = await fetchRecentFixes(hours);
  result.processed = 2;
  
  // Extract learnings
  const summary = await extractLearnings(issues, fixes);
  result.patternsExtracted = summary.patterns.length;
  
  // Store patterns in knowledge base
  for (const pattern of summary.patterns) {
    if (pattern.confidence < 0.5) continue; // Skip low confidence patterns
    
    // Check for duplicates
    const { data: existing } = await supa
      .from('knowledge_base')
      .select('id, usage_count')
      .eq('title', pattern.title)
      .single();
    
    if (existing) {
      // Update existing knowledge
      await supa.from('knowledge_base').update({
        confidence_score: pattern.confidence,
        usage_count: (existing.usage_count || 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      // Add new knowledge
      await supa.from('knowledge_base').insert([{
        category: pattern.type,
        title: pattern.title,
        content: pattern.description,
        learned_from: 'audit',
        confidence_score: pattern.confidence,
        tags: pattern.tags,
      }]);
      result.knowledgeItems++;
    }
  }
  
  // Store recommendations as knowledge
  for (const rec of summary.recommendations) {
    await supa.from('knowledge_base').insert([{
      category: 'best_practice',
      title: rec.slice(0, 100),
      content: rec,
      learned_from: 'audit',
      confidence_score: 0.7,
      tags: ['recommendation', 'auto-learned'],
    }]);
    result.knowledgeItems++;
  }
  
  console.log(`[Learning] processed=${result.processed}, patterns=${result.patternsExtracted}, knowledge=${result.knowledgeItems}`);
  
  return result;
}

// ==========================================================================
// QUERY KNOWLEDGE
// ==========================================================================

export async function queryKnowledge(query: string, category?: string): Promise<LearningPattern[]> {
  const supa = supabaseAdmin();
  
  let queryBuilder = supa
    .from('knowledge_base')
    .select('*')
    .order('confidence_score', { ascending: false });
  
  if (category) {
    queryBuilder = queryBuilder.eq('category', category);
  }
  
  queryBuilder = queryBuilder.or(`title.ilike.%${query}%,content.ilike.%${query}%`);
  
  const { data } = await queryBuilder.limit(10);
  
  return (data || []).map((k: any) => ({
    type: k.category,
    title: k.title,
    description: k.content,
    confidence: k.confidence_score,
    tags: k.tags || [],
  }));
}

// ==========================================================================
// GET PLAYBOOKS FOR ISSUE
// ==========================================================================

export async function getRelevantPlaybooks(issueTitle: string, category: string): Promise<string[]> {
  const supa = supabaseAdmin();
  
  const { data } = await supa
    .from('knowledge_base')
    .select('content')
    .eq('category', 'playbook')
    .order('confidence_score', { ascending: false })
    .limit(5);
  
  return (data || []).map((k: any) => k.content);
}

// ==========================================================================
// EXPORTS
// ==========================================================================

export { LearningPattern, LearningSummary, LearningResult };
