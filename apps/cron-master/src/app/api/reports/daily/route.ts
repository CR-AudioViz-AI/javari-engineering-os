import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date');
  
  // Default to today
  const targetDate = dateStr ? new Date(dateStr) : new Date();
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    // Get all runs for the day
    const { data: runs } = await supabase
      .from('autonomous_runs')
      .select('*')
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString())
      .order('created_at', { ascending: true });

    // Get work items created/updated today
    const { data: workItems } = await supabase
      .from('work_items')
      .select('*')
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());

    // Get issues found today
    const { data: issues } = await supabase
      .from('audit_issues')
      .select('*')
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());

    // Get PRs merged today
    const { data: mergedItems } = await supabase
      .from('work_items')
      .select('*')
      .gte('merged_at', startOfDay.toISOString())
      .lte('merged_at', endOfDay.toISOString());

    // Calculate metrics
    const totalRuns = runs?.length || 0;
    const successfulRuns = runs?.filter(r => r.status === 'SUCCESS').length || 0;
    const issuesDetected = runs?.reduce((sum, r) => sum + (r.issues_detected_count || 0), 0) || 0;
    const fixesApplied = runs?.reduce((sum, r) => sum + (r.fixes_applied_count || 0), 0) || 0;

    // Group runs by job
    const runsByJob = runs?.reduce((acc, r) => {
      const jobId = r.job_id;
      if (!acc[jobId]) {
        acc[jobId] = { runs: 0, success: 0, failed: 0 };
      }
      acc[jobId].runs++;
      if (r.status === 'SUCCESS') acc[jobId].success++;
      else acc[jobId].failed++;
      return acc;
    }, {} as Record<string, { runs: number; success: number; failed: number }>) || {};

    const report = {
      report_type: 'daily',
      date: targetDate.toISOString().split('T')[0],
      generated_at: new Date().toISOString(),

      summary: {
        total_job_runs: totalRuns,
        successful_runs: successfulRuns,
        failed_runs: totalRuns - successfulRuns,
        success_rate: totalRuns > 0 ? `${Math.round((successfulRuns / totalRuns) * 100)}%` : '100%',
        issues_detected: issuesDetected,
        fixes_applied: fixesApplied,
        work_items_created: workItems?.length || 0,
        prs_merged: mergedItems?.length || 0,
      },

      jobs: runsByJob,

      issues: {
        total_found: issues?.length || 0,
        critical: issues?.filter(i => i.severity === 'CRITICAL').length || 0,
        high: issues?.filter(i => i.severity === 'HIGH').length || 0,
        medium: issues?.filter(i => i.severity === 'MEDIUM').length || 0,
        low: issues?.filter(i => i.severity === 'LOW').length || 0,
      },

      work_items: {
        created: workItems?.length || 0,
        by_status: workItems?.reduce((acc, w) => {
          acc[w.status] = (acc[w.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>) || {},
      },

      timeline: runs?.map(r => ({
        time: r.started_at,
        job_id: r.job_id,
        status: r.status,
        duration_ms: r.duration_ms,
        issues: r.issues_detected_count,
        fixes: r.fixes_applied_count,
      })) || [],
    };

    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
