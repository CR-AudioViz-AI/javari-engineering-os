import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    // Get all runs for the week
    const { data: runs } = await supabase
      .from('autonomous_runs')
      .select('*')
      .gte('created_at', weekAgo.toISOString())
      .order('created_at', { ascending: true });

    // Get work items
    const { data: workItems } = await supabase
      .from('work_items')
      .select('*')
      .gte('created_at', weekAgo.toISOString());

    // Get issues
    const { data: issues } = await supabase
      .from('audit_issues')
      .select('*')
      .gte('created_at', weekAgo.toISOString());

    // Get merged PRs
    const { data: mergedItems } = await supabase
      .from('work_items')
      .select('*')
      .gte('merged_at', weekAgo.toISOString());

    // Get proof reports
    const { data: proofReports } = await supabase
      .from('proof_reports')
      .select('*')
      .gte('created_at', weekAgo.toISOString())
      .order('created_at', { ascending: false });

    // Calculate daily breakdown
    const dailyStats: Record<string, {
      runs: number;
      success: number;
      issues: number;
      fixes: number;
    }> = {};

    for (let i = 0; i < 7; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dailyStats[dateStr] = { runs: 0, success: 0, issues: 0, fixes: 0 };
    }

    runs?.forEach(r => {
      const dateStr = r.created_at.split('T')[0];
      if (dailyStats[dateStr]) {
        dailyStats[dateStr].runs++;
        if (r.status === 'SUCCESS') dailyStats[dateStr].success++;
        dailyStats[dateStr].issues += r.issues_detected_count || 0;
        dailyStats[dateStr].fixes += r.fixes_applied_count || 0;
      }
    });

    // Calculate totals
    const totalRuns = runs?.length || 0;
    const successfulRuns = runs?.filter(r => r.status === 'SUCCESS').length || 0;
    const totalIssues = issues?.length || 0;
    const resolvedIssues = issues?.filter(i => i.resolved_at).length || 0;
    const totalFixes = runs?.reduce((sum, r) => sum + (r.fixes_applied_count || 0), 0) || 0;

    // Uptime calculation (based on health checks)
    const healthChecks = runs?.filter(r => r.job_id?.includes('health')) || [];
    const uptime = healthChecks.length > 0 
      ? Math.round((healthChecks.filter(h => h.status === 'SUCCESS').length / healthChecks.length) * 100)
      : 100;

    const report = {
      report_type: 'weekly',
      period: {
        start: weekAgo.toISOString(),
        end: now.toISOString(),
      },
      generated_at: now.toISOString(),

      executive_summary: {
        uptime_percentage: `${uptime}%`,
        total_job_runs: totalRuns,
        success_rate: totalRuns > 0 ? `${Math.round((successfulRuns / totalRuns) * 100)}%` : '100%',
        issues_found: totalIssues,
        issues_resolved: resolvedIssues,
        resolution_rate: totalIssues > 0 ? `${Math.round((resolvedIssues / totalIssues) * 100)}%` : '100%',
        auto_fixes_applied: totalFixes,
        prs_merged: mergedItems?.length || 0,
        proof_reports_generated: proofReports?.length || 0,
      },

      daily_breakdown: Object.entries(dailyStats)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, stats]) => ({
          date,
          ...stats,
          success_rate: stats.runs > 0 ? `${Math.round((stats.success / stats.runs) * 100)}%` : '100%',
        })),

      issues_by_severity: {
        critical: issues?.filter(i => i.severity === 'CRITICAL').length || 0,
        high: issues?.filter(i => i.severity === 'HIGH').length || 0,
        medium: issues?.filter(i => i.severity === 'MEDIUM').length || 0,
        low: issues?.filter(i => i.severity === 'LOW').length || 0,
      },

      issues_by_category: issues?.reduce((acc, i) => {
        acc[i.category] = (acc[i.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {},

      work_items_by_status: workItems?.reduce((acc, w) => {
        acc[w.status] = (acc[w.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {},

      top_issues: issues?.slice(0, 10).map(i => ({
        title: i.title,
        severity: i.severity,
        category: i.category,
        target: i.target_url || i.target_repo,
        resolved: !!i.resolved_at,
      })) || [],

      proof_of_monitoring: {
        total_proof_reports: proofReports?.length || 0,
        coverage: '24x7',
        latest_report: proofReports?.[0]?.created_at || null,
      },
    };

    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
