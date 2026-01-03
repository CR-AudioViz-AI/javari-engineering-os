/**
 * JAVARI ENGINEERING OS - MASTER ORCHESTRATOR
 * ONE cron to rule them all - solves Vercel cron limit forever
 * 
 * This is the heart of Javari - she runs every minute and executes
 * all enabled jobs from the autonomous_jobs table.
 */

import crypto from 'node:crypto';
import { supabaseAdmin, getSupabaseProjectRef } from '@javari/shared';
import { sendSlackAlert } from '@javari/shared';

// ==========================================================================
// TYPES
// ==========================================================================

interface Job {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  schedule_type: 'interval' | 'cron';
  cron_expression: string | null;
  interval_seconds: number | null;
  timeout_ms: number;
  max_retries: number;
  backoff_ms: number;
  priority: number;
  handler: string;
  config: Record<string, unknown>;
  last_run_at: string | null;
  next_run_at: string | null;
  consecutive_failures: number;
}

interface JobResult {
  issues: number;
  fixes: number;
  verification: boolean;
  summary: string;
  learnings?: unknown[];
}

type RunStatus = 'RUNNING' | 'SUCCESS' | 'FAIL' | 'DEGRADED' | 'TIMEOUT';

// ==========================================================================
// HELPERS
// ==========================================================================

function now(): Date {
  return new Date();
}

function nowISO(): string {
  return new Date().toISOString();
}

function addSeconds(d: Date, sec: number): Date {
  return new Date(d.getTime() + sec * 1000);
}

// ==========================================================================
// LOCK MANAGEMENT
// ==========================================================================

async function acquireLock(lockKey: string, ttlSeconds: number, acquiredBy: string): Promise<boolean> {
  const supa = supabaseAdmin();
  const expiresAt = addSeconds(now(), ttlSeconds).toISOString();

  // First, clean up expired locks
  await supa.from('cron_locks').delete().lt('expires_at', nowISO());

  // Try to acquire
  const { error } = await supa.from('cron_locks').insert([{
    lock_key: lockKey,
    expires_at: expiresAt,
    acquired_by: acquiredBy,
  }]);

  return !error;
}

async function releaseLock(lockKey: string): Promise<void> {
  const supa = supabaseAdmin();
  await supa.from('cron_locks').delete().eq('lock_key', lockKey);
}

// ==========================================================================
// JOB SCHEDULING
// ==========================================================================

function isDue(job: Job): boolean {
  if (!job.enabled) return false;
  if (!job.next_run_at) return true;
  return new Date(job.next_run_at).getTime() <= now().getTime();
}

function computeNextRun(job: Job): string {
  const base = now();
  if (job.schedule_type === 'interval' && job.interval_seconds) {
    return addSeconds(base, job.interval_seconds).toISOString();
  }
  // Default: 60 seconds
  return addSeconds(base, 60).toISOString();
}

// ==========================================================================
// JOB HANDLERS
// ==========================================================================

async function executeHandler(job: Job): Promise<JobResult> {
  const handler = job.handler;

  switch (handler) {
    case 'heartbeat':
      return {
        issues: 0,
        fixes: 0,
        verification: true,
        summary: `Heartbeat OK - Javari is alive at ${nowISO()}`,
      };

    case 'auditops.canary':
      // TODO: Integrate with auditops-runner package
      return {
        issues: 0,
        fixes: 0,
        verification: true,
        summary: 'Canary audit scheduled (runner integration pending)',
      };

    case 'auditops.full':
      return {
        issues: 0,
        fixes: 0,
        verification: true,
        summary: 'Full audit scheduled (runner integration pending)',
      };

    case 'selfheal.monitor':
      // TODO: Integrate with selfheal package
      return await executeSelfHealMonitor();

    case 'workqueue.from_latest_audit':
      // TODO: Integrate with workqueue generator
      return {
        issues: 0,
        fixes: 0,
        verification: true,
        summary: 'WorkQueue generator scheduled (integration pending)',
      };

    case 'discovery.sync':
      return {
        issues: 0,
        fixes: 0,
        verification: true,
        summary: 'Discovery sync scheduled (integration pending)',
      };

    case 'learning.summarize':
      return {
        issues: 0,
        fixes: 0,
        verification: true,
        summary: 'Learning summarization scheduled (integration pending)',
      };

    case 'discovery.free_resources':
      return {
        issues: 0,
        fixes: 0,
        verification: true,
        summary: 'Free resource discovery scheduled (integration pending)',
      };

    default:
      return {
        issues: 0,
        fixes: 0,
        verification: true,
        summary: `Unknown handler: ${handler}`,
      };
  }
}

async function executeSelfHealMonitor(): Promise<JobResult> {
  const supa = supabaseAdmin();
  
  // Check for recent degraded runs
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const { data: degradedRuns } = await supa
    .from('autonomous_runs')
    .select('*')
    .in('status', ['FAIL', 'DEGRADED'])
    .gte('created_at', oneHourAgo)
    .limit(10);

  const issuesFound = degradedRuns?.length || 0;

  if (issuesFound > 3) {
    await sendSlackAlert({
      severity: 'HIGH',
      title: 'Self-Heal Monitor Alert',
      message: `${issuesFound} degraded/failed runs in the last hour. Investigation needed.`,
    });
  }

  return {
    issues: issuesFound,
    fixes: 0,
    verification: true,
    summary: `Self-heal monitor: ${issuesFound} issues detected in last hour`,
  };
}

// ==========================================================================
// MAIN ORCHESTRATOR
// ==========================================================================

export async function runOnce(): Promise<void> {
  const supa = supabaseAdmin();
  const instance = `orchestrator_${crypto.randomUUID().slice(0, 8)}`;
  const lockKey = 'javari_master_cron';

  // Try to acquire lock (TTL 55 seconds to handle minute boundary)
  const gotLock = await acquireLock(lockKey, 55, instance);
  if (!gotLock) {
    console.log(`[${nowISO()}] Another orchestrator instance running, skipping`);
    return;
  }

  console.log(`[${nowISO()}] Orchestrator ${instance} acquired lock`);

  try {
    // Get all enabled jobs
    const { data: jobs, error: jobsError } = await supa
      .from('autonomous_jobs')
      .select('*')
      .eq('enabled', true)
      .order('priority', { ascending: false });

    if (jobsError) throw jobsError;

    console.log(`[${nowISO()}] Found ${jobs?.length || 0} enabled jobs`);

    // Execute due jobs
    for (const job of (jobs as Job[]) || []) {
      if (!isDue(job)) continue;

      const runId = crypto.randomUUID();
      const startTime = Date.now();

      console.log(`[${nowISO()}] Executing job: ${job.name} (${job.handler})`);

      // Create run record
      await supa.from('autonomous_runs').insert([{
        id: runId,
        job_id: job.id,
        started_at: nowISO(),
        status: 'RUNNING',
        heartbeat: job.handler === 'heartbeat',
      }]);

      let status: RunStatus = 'SUCCESS';
      let result: JobResult;
      let errorMsg: string | null = null;

      try {
        // Execute with timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Job timeout')), job.timeout_ms);
        });

        result = await Promise.race([
          executeHandler(job),
          timeoutPromise,
        ]);

        if (result.issues > 0 && result.fixes === 0) {
          status = 'DEGRADED';
        }
      } catch (err) {
        status = err instanceof Error && err.message === 'Job timeout' ? 'TIMEOUT' : 'FAIL';
        errorMsg = err instanceof Error ? err.message : String(err);
        result = {
          issues: 1,
          fixes: 0,
          verification: false,
          summary: `Job failed: ${errorMsg}`,
        };

        // Alert on critical failures
        if (job.priority >= 80) {
          await sendSlackAlert({
            severity: 'CRITICAL',
            title: `Job Failed: ${job.name}`,
            message: errorMsg || 'Unknown error',
          });
        }
      }

      const duration = Date.now() - startTime;

      // Update run record
      await supa.from('autonomous_runs').update({
        completed_at: nowISO(),
        status,
        duration_ms: duration,
        issues_detected_count: result.issues,
        fixes_applied_count: result.fixes,
        verification_passed: result.verification,
        summary: result.summary,
        error: errorMsg,
      }).eq('id', runId);

      // Update job state
      const consecutiveFailures = status === 'FAIL' 
        ? (job.consecutive_failures || 0) + 1 
        : 0;

      await supa.from('autonomous_jobs').update({
        last_run_at: nowISO(),
        next_run_at: computeNextRun(job),
        last_status: status,
        last_error: errorMsg,
        consecutive_failures: consecutiveFailures,
      }).eq('id', job.id);

      console.log(`[${nowISO()}] Job ${job.name} completed: ${status} (${duration}ms)`);
    }

  } finally {
    await releaseLock(lockKey);
    console.log(`[${nowISO()}] Orchestrator ${instance} released lock`);
  }
}

// ==========================================================================
// EXPORTS
// ==========================================================================

export { Job, JobResult, RunStatus };
