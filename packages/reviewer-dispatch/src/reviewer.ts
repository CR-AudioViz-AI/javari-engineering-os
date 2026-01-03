/**
 * JAVARI ENGINEERING OS - REVIEWER DISPATCH
 * Sends PR diffs to ChatGPT for architecture review
 * 
 * ChatGPT = Architect, Claude = Builder
 * Together they make Javari stronger
 */

import { supabaseAdmin } from '@javari/shared';
import { buildReviewerPrompt } from '@javari/shared';
import { OpenAIAdapter } from '@javari/llm';

// ==========================================================================
// TYPES
// ==========================================================================

interface ReviewInput {
  workItemId: string;
  prUrl: string;
  diffText: string;
  ciSummary?: string;
}

interface ReviewResult {
  status: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED' | 'ERROR';
  score: number;
  notes: string;
  requiredChanges: string[];
}

// ==========================================================================
// GITHUB DIFF FETCHER
// ==========================================================================

async function fetchPRDiff(prUrl: string): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Missing GITHUB_TOKEN');
  
  // Convert PR URL to API URL
  // https://github.com/owner/repo/pull/123 -> https://api.github.com/repos/owner/repo/pulls/123
  const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) throw new Error('Invalid PR URL');
  
  const [, owner, repo, prNumber] = match;
  
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3.diff',
        'User-Agent': 'javari-engineering-os',
      },
    }
  );
  
  if (!res.ok) {
    throw new Error(`Failed to fetch PR diff: ${res.status}`);
  }
  
  return res.text();
}

// ==========================================================================
// REVIEW PARSER
// ==========================================================================

function parseReviewResponse(content: string): ReviewResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        status: parsed.status || 'ERROR',
        score: typeof parsed.score === 'number' ? parsed.score : 0,
        notes: parsed.notes || '',
        requiredChanges: Array.isArray(parsed.required_changes) ? parsed.required_changes : [],
      };
    }
  } catch {
    // Fall through to default
  }
  
  // Default if parsing fails
  return {
    status: 'ERROR',
    score: 0,
    notes: 'Failed to parse reviewer response',
    requiredChanges: [],
  };
}

// ==========================================================================
// MAIN REVIEWER
// ==========================================================================

export async function runArchitectReview(input: ReviewInput): Promise<ReviewResult> {
  const supa = supabaseAdmin();
  
  // Fetch diff if not provided
  let diffText = input.diffText;
  if (!diffText && input.prUrl) {
    try {
      diffText = await fetchPRDiff(input.prUrl);
    } catch (err) {
      return {
        status: 'ERROR',
        score: 0,
        notes: `Failed to fetch diff: ${err instanceof Error ? err.message : String(err)}`,
        requiredChanges: [],
      };
    }
  }
  
  // Build review prompt
  const prompt = buildReviewerPrompt(
    input.prUrl,
    diffText || 'No diff available',
    input.ciSummary || 'No CI summary available'
  );
  
  // Call OpenAI (ChatGPT as architect)
  const adapter = new OpenAIAdapter();
  
  let response;
  try {
    response = await adapter.call({
      provider: 'openai',
      role: 'reviewer',
      model: process.env.REVIEW_MODEL || 'gpt-4o',
      prompt,
      temperature: 0.1,
      maxTokens: 2048,
    });
  } catch (err) {
    return {
      status: 'ERROR',
      score: 0,
      notes: `Review failed: ${err instanceof Error ? err.message : String(err)}`,
      requiredChanges: [],
    };
  }
  
  // Parse response
  const result = parseReviewResponse(response.content);
  
  // Store review
  await supa.from('work_reviews').insert([{
    work_item_id: input.workItemId,
    reviewer_model: response.model,
    status: result.status,
    score: result.score,
    notes: result.notes,
    required_changes: result.requiredChanges,
  }]);
  
  // Update work item status based on review
  if (result.status === 'APPROVED') {
    await supa.from('work_items').update({ status: 'VERIFIED' }).eq('id', input.workItemId);
  } else if (result.status === 'REJECTED') {
    await supa.from('work_items').update({
      status: 'FAILED',
      last_error: `Architect rejected: ${result.notes}`,
    }).eq('id', input.workItemId);
  }
  // CHANGES_REQUESTED stays at PR_OPENED for iteration
  
  console.log(`[Reviewer] ${input.workItemId}: ${result.status} (score: ${result.score})`);
  
  return result;
}

// ==========================================================================
// REVIEW WORK ITEM BY ID
// ==========================================================================

export async function reviewWorkItem(workItemId: string): Promise<ReviewResult> {
  const supa = supabaseAdmin();
  
  // Get PR artifact
  const { data: artifact } = await supa
    .from('work_artifacts')
    .select('url, metadata')
    .eq('work_item_id', workItemId)
    .eq('artifact_type', 'pr')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (!artifact?.url) {
    return {
      status: 'ERROR',
      score: 0,
      notes: 'No PR found for this work item',
      requiredChanges: [],
    };
  }
  
  return runArchitectReview({
    workItemId,
    prUrl: artifact.url,
    diffText: '',
  });
}

// ==========================================================================
// EXPORTS
// ==========================================================================

export { ReviewInput, ReviewResult };
