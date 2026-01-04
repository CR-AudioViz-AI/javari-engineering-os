import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';

/**
 * ChatGPT Requirement: Synthetic Customer Monitoring
 * 
 * Run 1-3 customer flows per app hourly.
 * Store an "Experience Score".
 * Alert instantly on regression.
 * 
 * This is how companies like Stripe/Datadog validate customer experience.
 */

interface FlowStep {
  action: string;
  url?: string;
  selector?: string;
  value?: string;
  expected_status?: number;
  timeout_ms?: number;
}

interface FlowResult {
  step_name: string;
  success: boolean;
  duration_ms: number;
  error?: string;
}

async function runSimpleHealthFlow(domain: string): Promise<{
  success: boolean;
  steps: FlowResult[];
  total_duration_ms: number;
  experience_score: number;
}> {
  const steps: FlowResult[] = [];
  let totalDuration = 0;
  const startTime = Date.now();

  // Step 1: Homepage load
  try {
    const homeStart = Date.now();
    const homeRes = await fetch(`https://${domain}`, {
      signal: AbortSignal.timeout(15000),
    });
    const homeDuration = Date.now() - homeStart;
    totalDuration += homeDuration;
    
    steps.push({
      step_name: 'homepage_load',
      success: homeRes.ok,
      duration_ms: homeDuration,
      error: homeRes.ok ? undefined : `HTTP ${homeRes.status}`,
    });
  } catch (e) {
    steps.push({
      step_name: 'homepage_load',
      success: false,
      duration_ms: Date.now() - startTime,
      error: e instanceof Error ? e.message : 'Timeout or network error',
    });
    return { success: false, steps, total_duration_ms: totalDuration, experience_score: 0 };
  }

  // Step 2: API health check (if exists)
  try {
    const apiStart = Date.now();
    const apiRes = await fetch(`https://${domain}/api/health`, {
      signal: AbortSignal.timeout(10000),
    });
    const apiDuration = Date.now() - apiStart;
    totalDuration += apiDuration;
    
    steps.push({
      step_name: 'api_health',
      success: apiRes.ok,
      duration_ms: apiDuration,
      error: apiRes.ok ? undefined : `HTTP ${apiRes.status}`,
    });
  } catch (e) {
    steps.push({
      step_name: 'api_health',
      success: false,
      duration_ms: 0,
      error: 'API health endpoint not available',
    });
  }

  // Step 3: Check response time is acceptable
  const avgResponseTime = totalDuration / steps.filter(s => s.success).length;
  const responseTimeOk = avgResponseTime < 3000; // 3 second threshold

  // Calculate experience score (0-100)
  const successfulSteps = steps.filter(s => s.success).length;
  const stepScore = (successfulSteps / steps.length) * 50; // 50% weight
  const speedScore = Math.max(0, 50 - (avgResponseTime / 100)); // 50% weight, penalize slow response
  const experienceScore = Math.round(stepScore + speedScore);

  return {
    success: steps.every(s => s.success) && responseTimeOk,
    steps,
    total_duration_ms: totalDuration,
    experience_score: Math.min(100, experienceScore),
  };
}

export async function POST(request: Request) {
  const requestId = `syn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    const body = await request.json();
    const { domain, flow_name } = body as { domain: string; flow_name?: string };

    if (!domain) {
      return NextResponse.json({
        error: 'domain is required',
        request_id: requestId,
      }, { status: 400 });
    }

    // Run the synthetic monitoring flow
    const result = await runSimpleHealthFlow(domain);

    // Store result in synthetic_runs
    const { data: runData, error: insertError } = await supabase
      .from('synthetic_runs')
      .insert({
        domain,
        flow_name: flow_name || 'health_check',
        status: result.success ? 'pass' : 'fail',
        duration_ms: result.total_duration_ms,
        experience_score: result.experience_score,
        steps_completed: result.steps.filter(s => s.success).length,
        total_steps: result.steps.length,
        error_message: result.success ? null : result.steps.find(s => !s.success)?.error,
        request_id: requestId,
        environment_signature: {
          node_env: process.env.NODE_ENV,
          region: process.env.VERCEL_REGION || 'unknown',
        },
      })
      .select('id')
      .single();

    // Check for regression (compare to last 5 runs)
    const { data: recentRuns } = await supabase
      .from('synthetic_runs')
      .select('experience_score')
      .eq('domain', domain)
      .order('timestamp', { ascending: false })
      .limit(5);

    let regression = false;
    let regressionDetails = null;
    
    if (recentRuns && recentRuns.length >= 3) {
      const avgRecentScore = recentRuns.slice(1).reduce((sum, r) => sum + (r.experience_score || 0), 0) / (recentRuns.length - 1);
      if (result.experience_score < avgRecentScore - 15) {
        regression = true;
        regressionDetails = {
          current_score: result.experience_score,
          average_recent: Math.round(avgRecentScore),
          drop: Math.round(avgRecentScore - result.experience_score),
        };
      }
    }

    // Store metric in metrics_json for claim validation
    await supabase.from('metrics_json').insert({
      metric_key: `experience_score_${domain}`,
      metric_value: {
        domain,
        score: result.experience_score,
        success: result.success,
        duration_ms: result.total_duration_ms,
      },
      computed_from: ['synthetic_runs'],
      evidence_ids: runData ? [runData.id] : [],
    });

    return NextResponse.json({
      request_id: requestId,
      timestamp: new Date().toISOString(),
      domain,
      flow_name: flow_name || 'health_check',
      result: {
        success: result.success,
        experience_score: result.experience_score,
        total_duration_ms: result.total_duration_ms,
        steps: result.steps,
      },
      regression: regression ? {
        detected: true,
        ...regressionDetails,
        alert: `ALERT: Experience score dropped ${regressionDetails?.drop} points!`,
      } : { detected: false },
      run_id: runData?.id,
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Synthetic monitoring failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId,
      message: 'I cannot confirm synthetic monitoring results.',
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const requestId = `syn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get('domain');
  const limit = parseInt(searchParams.get('limit') || '20');

  try {
    let query = supabase
      .from('synthetic_runs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (domain) query = query.eq('domain', domain);

    const { data: runs, error } = await query;
    if (error) throw error;

    // Calculate aggregate stats
    const stats = {
      total_runs: runs?.length || 0,
      pass_rate: runs ? Math.round((runs.filter(r => r.status === 'pass').length / runs.length) * 100) : 0,
      avg_experience_score: runs ? Math.round(runs.reduce((sum, r) => sum + (r.experience_score || 0), 0) / runs.length) : 0,
      avg_duration_ms: runs ? Math.round(runs.reduce((sum, r) => sum + (r.duration_ms || 0), 0) / runs.length) : 0,
    };

    return NextResponse.json({
      request_id: requestId,
      timestamp: new Date().toISOString(),
      domain: domain || 'all',
      stats,
      runs,
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Failed to fetch synthetic runs',
      request_id: requestId,
    }, { status: 500 });
  }
}
