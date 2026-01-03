/**
 * JAVARI ENGINEERING OS - BUILDER DISPATCH
 * Routes work items to AI builders (Claude/OpenAI) for code generation
 * 
 * This is where Javari learns to BUILD
 */

import { supabaseAdmin, buildClaudePrompt } from '@javari/shared';
import { ClaudeAdapter, OpenAIAdapter, LLMResponse } from '@javari/llm';

// ==========================================================================
// TYPES
// ==========================================================================

interface WorkItemForDispatch {
  id: string;
  fingerprint: string;
  title: string;
  description: string;
  severity: string;
  category: string;
  domain?: string;
  repo?: string;
  route_or_endpoint?: string;
  recommended_fix?: string;
  acceptance_criteria: string[];
  verification_plan: string[];
  rollback_plan: string[];
  evidence_urls: string[];
  assigned_model: string;
  requires_approval: boolean;
  approved_at?: string;
  tags: string[];
  priority_score: number;
  source_run_id?: string;
  source_issue_fingerprint?: string;
  attempts?: number;
}

interface DispatchResult {
  dispatched: boolean;
  reason?: string;
  provider?: string;
  model?: string;
  artifactId?: string;
  content?: string;
}

interface PatchBundle {
  workItemId: string;
  changes: Record<string, string>;
  summaryMd: string;
  verificationCommands: string[];
}

// ==========================================================================
// RESPONSE PARSER
// ==========================================================================

function parseBuilderResponse(content: string): PatchBundle | null {
  const changes: Record<string, string> = {};
  const filePattern = /(?:FILE|File|Path):\s*([^\n]+)\n```[\w]*\n([\s\S]*?)```/g;
  
  let match;
  while ((match = filePattern.exec(content)) !== null) {
    const filePath = match[1].trim();
    const fileContent = match[2];
    if (filePath && fileContent) {
      changes[filePath] = fileContent;
    }
  }
  
  const summaryMatch = content.match(/(?:SUMMARY|Plan):\s*([\s\S]*?)(?=FILE|```|$)/i);
  const summaryMd = summaryMatch ? summaryMatch[1].trim() : content.slice(0, 500);
  
  const verificationCommands: string[] = [];
  const cmdPattern = /(?:VERIFY|Run):\s*`([^`]+)`/gi;
  while ((match = cmdPattern.exec(content)) !== null) {
    verificationCommands.push(match[1]);
  }
  
  return { workItemId: '', changes, summaryMd, verificationCommands };
}

// ==========================================================================
// MAIN DISPATCH
// ==========================================================================

export async function dispatchWorkItem(workItemId: string): Promise<DispatchResult> {
  const supa = supabaseAdmin();
  
  const { data: item, error } = await supa
    .from('work_items')
    .select('*')
    .eq('id', workItemId)
    .single();
  
  if (error || !item) {
    return { dispatched: false, reason: 'Work item not found' };
  }
  
  const workItem = item as WorkItemForDispatch;
  
  // Check approval
  if (workItem.requires_approval && !workItem.approved_at) {
    await supa.from('work_items').update({
      status: 'BLOCKED',
      last_error: 'Requires approval',
    }).eq('id', workItemId);
    return { dispatched: false, reason: 'approval_required' };
  }
  
  await supa.from('work_items').update({ status: 'DISPATCHED' }).eq('id', workItemId);
  
  // Build prompt
  const prompt = buildClaudePrompt({
    version: 1,
    fingerprint: workItem.fingerprint,
    title: workItem.title,
    description: workItem.description,
    severity: workItem.severity as any,
    category: workItem.category as any,
    domain: workItem.domain,
    repo: workItem.repo,
    route_or_endpoint: workItem.route_or_endpoint,
    recommended_fix: workItem.recommended_fix,
    acceptance_criteria: workItem.acceptance_criteria || [],
    verification_plan: workItem.verification_plan || [],
    rollback_plan: workItem.rollback_plan || [],
    evidence_urls: workItem.evidence_urls || [],
    assigned_model: (workItem.assigned_model as any) || 'claude',
    requires_approval: workItem.requires_approval,
    tags: workItem.tags || [],
    priority_score: workItem.priority_score,
    source: {
      audit_run_id: workItem.source_run_id,
      audit_issue_fingerprint: workItem.source_issue_fingerprint,
    },
  });
  
  // Store prompt
  await supa.from('work_artifacts').insert([{
    work_item_id: workItemId,
    artifact_type: 'prompt',
    url: 'inline',
    metadata: { prompt, timestamp: new Date().toISOString() },
  }]);
  
  const provider = workItem.assigned_model === 'openai' ? 'openai' : 'claude';
  let response: LLMResponse;
  
  try {
    if (provider === 'openai') {
      const adapter = new OpenAIAdapter();
      response = await adapter.call({
        provider: 'openai',
        role: 'builder',
        model: process.env.BUILDER_MODEL_OPENAI || 'gpt-4o',
        prompt,
        temperature: 0.2,
        maxTokens: 8192,
      });
    } else {
      const adapter = new ClaudeAdapter();
      response = await adapter.call({
        provider: 'claude',
        role: 'builder',
        model: process.env.BUILDER_MODEL_CLAUDE || 'claude-sonnet-4-20250514',
        prompt,
        temperature: 0.2,
        maxTokens: 8192,
      });
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await supa.from('work_items').update({
      status: 'FAILED',
      last_error: `Builder failed: ${errorMsg}`,
      attempts: (workItem.attempts || 0) + 1,
    }).eq('id', workItemId);
    return { dispatched: false, reason: errorMsg };
  }
  
  // Store response
  const { data: responseArtifact } = await supa.from('work_artifacts').insert([{
    work_item_id: workItemId,
    artifact_type: 'response',
    url: 'inline',
    metadata: {
      content: response.content,
      model: response.model,
      provider: response.provider,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    },
  }]).select('id').single();
  
  // Parse and store patch bundle
  const patchBundle = parseBuilderResponse(response.content);
  if (patchBundle && Object.keys(patchBundle.changes).length > 0) {
    patchBundle.workItemId = workItemId;
    await supa.from('work_artifacts').insert([{
      work_item_id: workItemId,
      artifact_type: 'patch_bundle',
      url: 'inline',
      metadata: patchBundle,
    }]);
  }
  
  await supa.from('work_items').update({ status: 'IN_PROGRESS' }).eq('id', workItemId);
  
  await supa.from('work_runs').insert([{
    work_item_id: workItemId,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    status: 'SUCCESS',
    builder_model: response.model,
    output_summary: patchBundle?.summaryMd || 'Response received',
  }]);
  
  console.log(`[Builder] Dispatched ${workItemId} via ${provider}/${response.model}`);
  
  return {
    dispatched: true,
    provider: response.provider,
    model: response.model,
    artifactId: responseArtifact?.id,
    content: response.content,
  };
}

export async function dispatchNextWorkItems(limit = 5): Promise<DispatchResult[]> {
  const supa = supabaseAdmin();
  
  const { data: items } = await supa
    .from('work_items')
    .select('id')
    .eq('status', 'NEW')
    .order('priority_score', { ascending: false })
    .limit(limit);
  
  const results: DispatchResult[] = [];
  
  for (const item of items || []) {
    const result = await dispatchWorkItem(item.id);
    results.push(result);
    await new Promise(r => setTimeout(r, 1000));
  }
  
  return results;
}

export { WorkItemForDispatch, DispatchResult, PatchBundle };
