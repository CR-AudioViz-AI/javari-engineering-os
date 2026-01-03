/**
 * JAVARI ENGINEERING OS - WORKQUEUE GENERATOR
 * Converts audit issues into structured work items
 * 
 * This is how Javari turns problems into actionable fixes
 */

import crypto from 'node:crypto';
import { supabaseAdmin } from '@javari/shared';

// ==========================================================================
// TYPES
// ==========================================================================

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
type Category = 'OPS' | 'SECURITY' | 'API' | 'SEO' | 'A11Y' | 'PERF' | 'UX' | 'DATA' | 'PAYMENTS' | 'AUTH' | 'COST' | 'LEARNING' | 'OTHER';
type WorkStatus = 'NEW' | 'DISPATCHED' | 'IN_PROGRESS' | 'PR_OPENED' | 'VERIFIED' | 'MERGED' | 'DEPLOYED' | 'BLOCKED' | 'FAILED' | 'SUPPRESSED';

interface AuditIssue {
  id: string;
  run_id: string;
  fingerprint: string;
  severity: string;
  category: string;
  title: string;
  url: string | null;
  details: Record<string, unknown>;
  evidence: Record<string, unknown>;
}

interface GenerationResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
  workItemIds: string[];
}

interface WorkItem {
  id: string;
  fingerprint: string;
  title: string;
  description: string;
  severity: Severity;
  category: Category;
  status: WorkStatus;
  priority_score: number;
}

// ==========================================================================
// HELPERS
// ==========================================================================

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function canonicalFingerprint(input: { category: string; severity: string; title: string; url?: string }): string {
  const base = [
    input.category.trim().toUpperCase(),
    input.severity.trim().toUpperCase(),
    input.title.trim(),
    (input.url || '').trim(),
  ].join('|');
  return sha256(base);
}

function mapSeverity(s: string): Severity {
  const up = (s || '').toUpperCase();
  if (up.includes('CRIT')) return 'CRITICAL';
  if (up.includes('HIGH')) return 'HIGH';
  if (up.includes('MED')) return 'MEDIUM';
  if (up.includes('LOW')) return 'LOW';
  return 'INFO';
}

function mapCategory(c: string): Category {
  const up = (c || '').toUpperCase();
  if (up.includes('SEC')) return 'SECURITY';
  if (up.includes('API')) return 'API';
  if (up.includes('SEO')) return 'SEO';
  if (up.includes('A11Y') || up.includes('ACCESS')) return 'A11Y';
  if (up.includes('PERF')) return 'PERF';
  if (up.includes('DATA') || up.includes('DB')) return 'DATA';
  if (up.includes('AUTH')) return 'AUTH';
  if (up.includes('PAY')) return 'PAYMENTS';
  if (up.includes('OPS')) return 'OPS';
  if (up.includes('COST')) return 'COST';
  return 'OTHER';
}

// ==========================================================================
// FIX RECOMMENDATION ENGINE
// ==========================================================================

function generateRecommendedFix(title: string, severity: Severity, url: string | null): string {
  const titleLower = title.toLowerCase();
  
  if (titleLower.includes('cron') && titleLower.includes('limit')) {
    return `CRITICAL: Consolidate all cron jobs into master orchestrator.
1. Deploy javari-engineering-os master cron
2. Migrate per-project crons to autonomous_jobs table
3. Delete individual project crons
4. Verify master cron heartbeat`;
  }
  
  if (titleLower.includes('503')) {
    return `FIX 503 on ${url || 'page'}:
1. Check Vercel function logs
2. Verify environment variables
3. Check Supabase connection
4. Add graceful error handling`;
  }
  
  if (titleLower.includes('500')) {
    return `FIX 500 on ${url || 'endpoint'}:
1. Check server logs for stack trace
2. Verify database queries
3. Add try/catch with structured errors
4. Validate input parameters`;
  }
  
  if (titleLower.includes('404')) {
    return `FIX 404 on ${url || 'route'}:
1. Verify route file exists
2. Check for typos (case sensitive)
3. Ensure proper routing conventions
4. Add missing handler`;
  }
  
  return `Resolve: ${title}
1. Investigate root cause
2. Implement fix with tests
3. Verify in preview
4. Document solution`;
}

function generateAcceptanceCriteria(issue: AuditIssue): string[] {
  const criteria = [
    `Issue "${issue.title}" is fully resolved`,
    'No new errors introduced',
    'All tests pass',
  ];
  
  if (issue.url) {
    criteria.unshift(`${issue.url} returns 200 OK`);
  }
  
  return criteria;
}

function generateVerificationPlan(issue: AuditIssue): string[] {
  const plan = ['pnpm lint && pnpm typecheck', 'pnpm test', 'pnpm audit:canary'];
  if (issue.url) {
    plan.unshift(`curl -sI "${issue.url}" | head -1`);
  }
  return plan;
}

function generateRollbackPlan(): string[] {
  return [
    'Revert PR or rollback in Vercel',
    'Disable new feature flags',
    'Re-run audit:canary',
    'Notify team if needed',
  ];
}

// ==========================================================================
// MAIN GENERATOR
// ==========================================================================

export async function generateWorkItemsFromAuditRun(runId: string): Promise<GenerationResult> {
  const supa = supabaseAdmin();
  
  const { data: issues, error } = await supa
    .from('audit_issues')
    .select('*')
    .eq('run_id', runId);
  
  if (error) throw error;
  
  const result: GenerationResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    total: issues?.length || 0,
    workItemIds: [],
  };
  
  for (const issue of (issues as AuditIssue[]) || []) {
    const severity = mapSeverity(issue.severity);
    const category = mapCategory(issue.category);
    
    if (severity === 'INFO') {
      result.skipped++;
      continue;
    }
    
    const fingerprint = canonicalFingerprint({
      category,
      severity,
      title: issue.title,
      url: issue.url || undefined,
    });
    
    const workItemData = {
      fingerprint,
      title: issue.title,
      description: `${issue.title}\n\nURL: ${issue.url || '(n/a)'}\n\nDetails:\n${JSON.stringify(issue.details || {}, null, 2)}`,
      severity,
      category,
      route_or_endpoint: issue.url,
      recommended_fix: generateRecommendedFix(issue.title, severity, issue.url),
      acceptance_criteria: generateAcceptanceCriteria(issue),
      verification_plan: generateVerificationPlan(issue),
      rollback_plan: generateRollbackPlan(),
      evidence_urls: Object.values(issue.evidence || {}).filter(Boolean).map(String),
      source_run_id: runId,
      source_issue_fingerprint: issue.fingerprint,
      priority_score: severity === 'CRITICAL' ? 95 : severity === 'HIGH' ? 80 : 50,
      requires_approval: severity === 'CRITICAL' || severity === 'HIGH',
      assigned_model: 'claude',
      tags: [category.toLowerCase(), severity.toLowerCase()],
      created_by: 'auditops',
    };
    
    const { data: existing } = await supa
      .from('work_items')
      .select('id, status')
      .eq('fingerprint', fingerprint)
      .single();
    
    if (existing) {
      if (['IN_PROGRESS', 'PR_OPENED', 'VERIFIED', 'MERGED', 'DEPLOYED'].includes(existing.status)) {
        result.skipped++;
        continue;
      }
      
      await supa.from('work_items').update({
        ...workItemData,
        status: 'NEW',
      }).eq('id', existing.id);
      
      result.updated++;
      result.workItemIds.push(existing.id);
    } else {
      const { data: newItem } = await supa
        .from('work_items')
        .insert([{ ...workItemData, status: 'NEW' }])
        .select('id')
        .single();
      
      if (newItem) {
        result.created++;
        result.workItemIds.push(newItem.id);
      }
    }
  }
  
  console.log(`[WorkQueue] Run ${runId}: created=${result.created}, updated=${result.updated}, skipped=${result.skipped}`);
  return result;
}

// ==========================================================================
// GET NEXT WORK ITEM
// ==========================================================================

export async function getNextWorkItem(): Promise<WorkItem | null> {
  const supa = supabaseAdmin();
  
  const { data } = await supa
    .from('work_items')
    .select('*')
    .eq('status', 'NEW')
    .order('priority_score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  
  return data as WorkItem | null;
}

// ==========================================================================
// STATE MACHINE
// ==========================================================================

const VALID_TRANSITIONS: Record<WorkStatus, WorkStatus[]> = {
  NEW: ['DISPATCHED', 'SUPPRESSED'],
  DISPATCHED: ['IN_PROGRESS', 'FAILED', 'BLOCKED'],
  IN_PROGRESS: ['PR_OPENED', 'FAILED', 'BLOCKED'],
  PR_OPENED: ['VERIFIED', 'FAILED', 'BLOCKED'],
  VERIFIED: ['MERGED', 'FAILED', 'BLOCKED'],
  MERGED: ['DEPLOYED', 'FAILED'],
  DEPLOYED: ['SUPPRESSED'],
  BLOCKED: ['DISPATCHED', 'FAILED', 'SUPPRESSED'],
  FAILED: ['DISPATCHED', 'SUPPRESSED'],
  SUPPRESSED: [],
};

export async function transitionWorkItem(
  id: string, 
  toStatus: WorkStatus, 
  opts?: { error?: string; cooldownMinutes?: number }
): Promise<boolean> {
  const supa = supabaseAdmin();
  
  const { data: item } = await supa
    .from('work_items')
    .select('status, attempts')
    .eq('id', id)
    .single();
  
  if (!item) return false;
  
  const fromStatus = item.status as WorkStatus;
  
  if (!VALID_TRANSITIONS[fromStatus]?.includes(toStatus)) {
    console.error(`Invalid transition: ${fromStatus} -> ${toStatus}`);
    return false;
  }
  
  const updates: Record<string, unknown> = {
    status: toStatus,
    last_error: opts?.error || null,
  };
  
  if (toStatus === 'FAILED') {
    updates.attempts = (item.attempts || 0) + 1;
  }
  
  if (opts?.cooldownMinutes) {
    updates.cooldown_until = new Date(Date.now() + opts.cooldownMinutes * 60000).toISOString();
  }
  
  const { error } = await supa.from('work_items').update(updates).eq('id', id);
  return !error;
}

export { AuditIssue, GenerationResult, WorkItem, WorkStatus, Severity, Category };
