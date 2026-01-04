import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

/**
 * ChatGPT Requirement: Synthetic Customer Monitoring
 * Run customer flows hourly, store Experience Score, alert on regression.
 */
export async function POST(request: Request) {
  const requestId = `syn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { domain, flow_name } = body as { domain: string; flow_name?: string };

    if (!domain) {
      return NextResponse.json({ error: 'domain required', request_id: requestId }, { status: 400 });
    }

    // Run simple health flow
    const startTime = Date.now();
    let success = true;
    let errorMsg = null;

    try {
      const res = await fetch(`https://${domain}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        success = false;
        errorMsg = `HTTP ${res.status}`;
      }
    } catch (e) {
      success = false;
      errorMsg = e instanceof Error ? e.message : 'Network error';
    }

    const duration = Date.now() - startTime;
    const experienceScore = success ? Math.max(0, 100 - Math.floor(duration / 100)) : 0;

    // Store result
    const { data: run } = await supabase.from('synthetic_runs').insert({
      domain,
      flow_name: flow_name || 'health_check',
      status: success ? 'pass' : 'fail',
      duration_ms: duration,
      experience_score: experienceScore,
      steps_completed: success ? 1 : 0,
      total_steps: 1,
      error_message: errorMsg,
      request_id: requestId,
      environment_signature: { region: process.env.VERCEL_REGION || 'unknown' },
    }).select('id').single();

    // Check for regression
    const { data: recentRuns } = await supabase
      .from('synthetic_runs')
      .select('experience_score')
      .eq('domain', domain)
      .order('timestamp', { ascending: false })
      .limit(5);

    let regression = false;
    if (recentRuns && recentRuns.length >= 3) {
      const avgRecent = recentRuns.slice(1).reduce((sum, r) => sum + (r.experience_score || 0), 0) / (recentRuns.length - 1);
      regression = experienceScore < avgRecent - 15;
    }

    // Store metric
    await supabase.from('metrics_json').insert({
      metric_key: `experience_score_${domain}`,
      metric_value: { domain, score: experienceScore, success, duration_ms: duration },
      computed_from: ['synthetic_runs'],
      evidence_ids: run ? [run.id] : [],
    });

    return NextResponse.json({
      request_id: requestId,
      timestamp: new Date().toISOString(),
      domain,
      result: { success, experience_score: experienceScore, duration_ms: duration },
      regression: { detected: regression },
      run_id: run?.id,
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Synthetic monitoring failed',
      details: error instanceof Error ? error.message : 'Unknown',
      request_id: requestId,
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const requestId = `syn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get('domain');

  try {
    const supabase = getSupabase();
    let query = supabase.from('synthetic_runs').select('*').order('timestamp', { ascending: false }).limit(20);
    if (domain) query = query.eq('domain', domain);
    const { data: runs } = await query;

    const stats = {
      total: runs?.length || 0,
      pass_rate: runs ? Math.round((runs.filter(r => r.status === 'pass').length / runs.length) * 100) : 0,
      avg_score: runs ? Math.round(runs.reduce((sum, r) => sum + (r.experience_score || 0), 0) / runs.length) : 0,
    };

    return NextResponse.json({ request_id: requestId, domain: domain || 'all', stats, runs });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch runs', request_id: requestId }, { status: 500 });
  }
}
