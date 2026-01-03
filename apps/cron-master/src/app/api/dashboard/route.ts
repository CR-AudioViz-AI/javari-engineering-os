import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    // Get job stats
    const { data: jobs } = await supabase
      .from('autonomous_jobs')
      .select('*');

    // Get recent runs (last 24h)
    const { data: recentRuns } = await supabase
      .from('autonomous_runs')
      .select('*')
      .gte('created_at', last24h.toISOString())
      .order('created_at', { ascending: false });

    // Get work items by status
    const { data: workItems } = await supabase
      .from('work_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    // Get audit issues
    const { data: auditIssues } = await supabase
      .from('audit_issues')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    // Calculate metrics
    const totalJobs = jobs?.length || 0;
    const enabledJobs = jobs?.filter(j => j.enabled).length || 0;
    const totalRuns24h = recentRuns?.length || 0;
    const successfulRuns24h = recentRuns?.filter(r => r.status === 'SUCCESS').length || 0;

    const workItemStats = {
      total: workItems?.length || 0,
      new: workItems?.filter(w => w.status === 'NEW').length || 0,
      in_progress: workItems?.filter(w => w.status === 'IN_PROGRESS').length || 0,
      pr_opened: workItems?.filter(w => w.status === 'PR_OPENED').length || 0,
      merged: workItems?.filter(w => w.status === 'MERGED').length || 0,
      deployed: workItems?.filter(w => w.status === 'DEPLOYED').length || 0,
    };

    const issuesBySeverity = {
      critical: auditIssues?.filter(i => i.severity === 'CRITICAL').length || 0,
      high: auditIssues?.filter(i => i.severity === 'HIGH').length || 0,
      medium: auditIssues?.filter(i => i.severity === 'MEDIUM').length || 0,
      low: auditIssues?.filter(i => i.severity === 'LOW').length || 0,
    };

    // Build dashboard response
    const dashboard = {
      timestamp: now.toISOString(),
      status: 'operational',
      
      overview: {
        total_jobs: totalJobs,
        enabled_jobs: enabledJobs,
        runs_last_24h: totalRuns24h,
        success_rate_24h: totalRuns24h > 0 ? Math.round((successfulRuns24h / totalRuns24h) * 100) : 100,
      },

      jobs: jobs?.map(j => ({
        name: j.job_name,
        enabled: j.enabled,
        cron: j.cron_expression,
        last_run: j.last_run_at,
        last_status: j.last_status,
        run_count: j.run_count,
        fail_count: j.fail_count,
      })) || [],

      work_items: workItemStats,

      issues: {
        total: auditIssues?.length || 0,
        by_severity: issuesBySeverity,
        unresolved: auditIssues?.filter(i => !i.resolved_at).length || 0,
      },

      recent_activity: recentRuns?.slice(0, 10).map(r => ({
        job_id: r.job_id,
        status: r.status,
        started_at: r.started_at,
        duration_ms: r.duration_ms,
        issues_found: r.issues_detected_count,
        fixes_applied: r.fixes_applied_count,
      })) || [],

      health: {
        supabase: 'connected',
        github: process.env.GITHUB_TOKEN ? 'configured' : 'missing',
        anthropic: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing',
        openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
        vercel: process.env.VERCEL_TOKEN ? 'configured' : 'missing',
      },
    };

    return NextResponse.json(dashboard);
  } catch (error) {
    return NextResponse.json({
      timestamp: now.toISOString(),
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
