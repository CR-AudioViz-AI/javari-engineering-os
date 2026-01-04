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
 * ChatGPT Requirement: Proof-Only Reporting
 * Reports ONLY from metrics_json data. No invented claims.
 */
export async function GET(request: Request) {
  const requestId = `rpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { searchParams } = new URL(request.url);
  const auditRunId = searchParams.get('audit_run_id');

  try {
    const supabase = getSupabase();

    // Get audit run
    let auditRun = null;
    if (auditRunId) {
      const { data } = await supabase.from('audit_runs').select('*').eq('id', auditRunId).single();
      auditRun = data;
    } else {
      const { data } = await supabase.from('audit_runs').select('*').order('started_at', { ascending: false }).limit(1).single();
      auditRun = data;
    }

    if (!auditRun) {
      return NextResponse.json({
        error: 'No audit run found',
        request_id: requestId,
        message: 'I cannot confirm any audit data exists.',
      }, { status: 404 });
    }

    // Get metrics
    const { data: metrics } = await supabase.from('metrics_json').select('*').eq('audit_run_id', auditRun.id);

    // Get verified claims
    const { data: claims } = await supabase.from('audit_claims').select('*').eq('audit_run_id', auditRun.id).eq('is_verified', true);

    // Get coverage
    const { data: coverage } = await supabase.from('coverage_metrics').select('*').eq('audit_run_id', auditRun.id);

    // Get synthetic runs
    const { data: syntheticRuns } = await supabase.from('synthetic_runs').select('*').order('timestamp', { ascending: false }).limit(50);

    // Get evidence count
    const { data: evidence } = await supabase.from('evidence_artifacts').select('id').eq('audit_run_id', auditRun.id);

    const report = {
      meta: {
        request_id: requestId,
        generated_at: new Date().toISOString(),
        audit_run_id: auditRun.id,
        proof_method: 'metrics_json_only',
        disclaimer: 'All claims derived from metrics_json with evidence.',
      },
      verified_metrics: (metrics || []).map(m => ({
        metric: m.metric_key,
        value: m.metric_value,
        evidence_ids: m.evidence_ids,
      })),
      verified_claims: (claims || []).map(c => ({
        claim: c.claim_text,
        value: c.claim_value,
        verified_at: c.verification_timestamp,
      })),
      coverage: coverage?.length ? {
        domains: coverage.length,
        data: coverage,
      } : { message: 'I cannot confirm coverage data.' },
      experience: syntheticRuns?.length ? {
        runs: syntheticRuns.length,
        avg_score: Math.round(syntheticRuns.reduce((s, r) => s + (r.experience_score || 0), 0) / syntheticRuns.length),
      } : { message: 'I cannot confirm experience data.' },
      evidence_count: evidence?.length || 0,
      assessment: {
        can_make_claims: (metrics?.length || 0) > 0,
        metrics_count: metrics?.length || 0,
        claims_count: claims?.length || 0,
        message: metrics?.length ? `Report has ${metrics.length} verified metrics.` : 'I cannot confirm any metrics.',
      },
    };

    return NextResponse.json(report);

  } catch (error) {
    return NextResponse.json({
      error: 'Report generation failed',
      details: error instanceof Error ? error.message : 'Unknown',
      request_id: requestId,
      message: 'I cannot confirm this report.',
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const requestId = `rpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { run_type } = body as { run_type?: string };

    const { data: auditRun, error } = await supabase.from('audit_runs').insert({
      run_type: run_type || 'manual',
      status: 'running',
      started_at: new Date().toISOString(),
      environment_signature: { region: process.env.VERCEL_REGION || 'unknown' },
    }).select('id').single();

    if (error) throw error;

    return NextResponse.json({
      request_id: requestId,
      timestamp: new Date().toISOString(),
      audit_run_id: auditRun?.id,
      status: 'running',
      message: 'Audit run started.',
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Failed to start audit',
      details: error instanceof Error ? error.message : 'Unknown',
      request_id: requestId,
    }, { status: 500 });
  }
}
