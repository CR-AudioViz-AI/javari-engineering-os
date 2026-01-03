import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '7');
  const severity = searchParams.get('severity');

  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    // Get audit runs
    const { data: runs } = await supabase
      .from('audit_runs')
      .select('*')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false });

    // Get audit issues
    let issueQuery = supabase
      .from('audit_issues')
      .select('*')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false });

    if (severity) {
      issueQuery = issueQuery.eq('severity', severity.toUpperCase());
    }

    const { data: issues } = await issueQuery;

    // Calculate stats
    const totalRuns = runs?.length || 0;
    const successfulRuns = runs?.filter(r => r.status === 'SUCCESS').length || 0;
    const totalIssues = issues?.length || 0;
    const resolvedIssues = issues?.filter(i => i.resolved_at).length || 0;

    const issuesBySeverity = {
      CRITICAL: issues?.filter(i => i.severity === 'CRITICAL').length || 0,
      HIGH: issues?.filter(i => i.severity === 'HIGH').length || 0,
      MEDIUM: issues?.filter(i => i.severity === 'MEDIUM').length || 0,
      LOW: issues?.filter(i => i.severity === 'LOW').length || 0,
    };

    const issuesByCategory = issues?.reduce((acc, i) => {
      acc[i.category] = (acc[i.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      period: `${days} days`,
      since: since.toISOString(),

      runs: {
        total: totalRuns,
        successful: successfulRuns,
        failed: totalRuns - successfulRuns,
        success_rate: totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 100,
      },

      issues: {
        total: totalIssues,
        resolved: resolvedIssues,
        unresolved: totalIssues - resolvedIssues,
        resolution_rate: totalIssues > 0 ? Math.round((resolvedIssues / totalIssues) * 100) : 100,
        by_severity: issuesBySeverity,
        by_category: issuesByCategory,
      },

      recent_runs: runs?.slice(0, 10).map(r => ({
        id: r.id,
        type: r.audit_type,
        status: r.status,
        started_at: r.started_at,
        completed_at: r.completed_at,
        issues_found: r.issues_found,
        duration_ms: r.duration_ms,
      })) || [],

      recent_issues: issues?.slice(0, 20).map(i => ({
        id: i.id,
        title: i.title,
        severity: i.severity,
        category: i.category,
        target: i.target_url || i.target_repo,
        created_at: i.created_at,
        resolved_at: i.resolved_at,
      })) || [],
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
