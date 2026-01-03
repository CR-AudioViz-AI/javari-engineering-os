import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const severity = searchParams.get('severity');
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    let query = supabase
      .from('work_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status.toUpperCase());
    }
    if (severity) {
      query = query.eq('severity', severity.toUpperCase());
    }

    const { data: workItems, error } = await query;

    if (error) throw error;

    // Group by status
    const byStatus: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    
    workItems?.forEach(item => {
      byStatus[item.status] = (byStatus[item.status] || 0) + 1;
      bySeverity[item.severity] = (bySeverity[item.severity] || 0) + 1;
    });

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      total: workItems?.length || 0,
      summary: {
        by_status: byStatus,
        by_severity: bySeverity,
      },
      items: workItems?.map(item => ({
        id: item.id,
        title: item.title,
        status: item.status,
        severity: item.severity,
        category: item.category,
        target_repo: item.target_repo,
        created_at: item.created_at,
        pr_url: item.pr_url,
        dispatched_at: item.dispatched_at,
        merged_at: item.merged_at,
      })) || [],
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
