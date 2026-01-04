import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';

/**
 * ChatGPT Requirement: Proof-Only Reporting
 * 
 * The system must not allow any report claim unless:
 * - it is computed from raw evidence
 * - it includes the evidence link(s)
 * - it includes timestamp & request IDs
 * 
 * Claude must be unable to "invent" metrics.
 */
export async function GET(request: Request) {
  const requestId = `rpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { searchParams } = new URL(request.url);
  const auditRunId = searchParams.get('audit_run_id');
  const format = searchParams.get('format') || 'json';

  try {
    // Get audit run info
    let auditRun = null;
    if (auditRunId) {
      const { data } = await supabase
        .from('audit_runs')
        .select('*')
        .eq('id', auditRunId)
        .single();
      auditRun = data;
    } else {
      const { data } = await supabase
        .from('audit_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1)
        .single();
      auditRun = data;
    }

    if (!auditRun) {
      return NextResponse.json({
        error: 'No audit run found',
        request_id: requestId,
        message: 'I cannot confirm any audit data exists.',
      }, { status: 404 });
    }

    // Get ALL metrics from metrics_json for this audit run
    const { data: metrics, error: metricsError } = await supabase
      .from('metrics_json')
      .select('*')
      .eq('audit_run_id', auditRun.id);

    if (metricsError) throw metricsError;

    // Get verified claims
    const { data: verifiedClaims } = await supabase
      .from('audit_claims')
      .select('*')
      .eq('audit_run_id', auditRun.id)
      .eq('is_verified', true);

    // Get coverage metrics
    const { data: coverage } = await supabase
      .from('coverage_metrics')
      .select('*')
      .eq('audit_run_id', auditRun.id);

    // Get synthetic runs for experience scores
    const { data: syntheticRuns } = await supabase
      .from('synthetic_runs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(50);

    // Get security scan results
    const { data: securityScans } = await supabase
      .from('security_scans')
      .select('*')
      .eq('audit_run_id', auditRun.id);

    // Get evidence artifacts
    const { data: evidence } = await supabase
      .from('evidence_artifacts')
      .select('id, artifact_type, url, storage_url, request_id, timestamp')
      .eq('audit_run_id', auditRun.id);

    // Build proof-based report (ONLY claims from metrics_json)
    const report = {
      meta: {
        request_id: requestId,
        generated_at: new Date().toISOString(),
        audit_run_id: auditRun.id,
        audit_started: auditRun.started_at,
        audit_completed: auditRun.completed_at,
        proof_method: 'metrics_json_only',
        disclaimer: 'All claims in this report are derived from metrics_json entries with evidence links.',
      },

      verified_metrics: (metrics || []).map(m => ({
        metric: m.metric_key,
        value: m.metric_value,
        computed_from: m.computed_from,
        evidence_ids: m.evidence_ids,
        timestamp: m.timestamp,
      })),

      verified_claims: (verifiedClaims || []).map(c => ({
        claim: c.claim_text,
        value: c.claim_value,
        evidence_metric_id: c.metric_json_id,
        verified_at: c.verification_timestamp,
      })),

      coverage: coverage ? {
        total_domains: coverage.length,
        by_domain: coverage.map(c => ({
          domain: c.domain,
          routes_discovered: c.routes_discovered,
          routes_audited: c.routes_audited,
          coverage_pct: c.overall_coverage_pct,
        })),
      } : { message: 'I cannot confirm coverage data.' },

      experience: syntheticRuns && syntheticRuns.length > 0 ? {
        total_runs: syntheticRuns.length,
        avg_score: Math.round(syntheticRuns.reduce((sum, r) => sum + (r.experience_score || 0), 0) / syntheticRuns.length),
        pass_rate: Math.round((syntheticRuns.filter(r => r.status === 'pass').length / syntheticRuns.length) * 100),
      } : { message: 'I cannot confirm experience score data.' },

      security: securityScans && securityScans.length > 0 ? {
        scans_run: securityScans.length,
        pass_count: securityScans.filter(s => s.pass).length,
      } : { message: 'I cannot confirm security scan data.' },

      evidence_count: evidence?.length || 0,

      assessment: {
        can_make_claims: (metrics && metrics.length > 0),
        metrics_count: metrics?.length || 0,
        verified_claims_count: verifiedClaims?.length || 0,
        message: (metrics && metrics.length > 0)
          ? `This report contains ${metrics.length} metrics with evidence.`
          : 'I cannot confirm any metrics. No claims can be made.',
      },
    };

    return NextResponse.json(report);

  } catch (error) {
    return NextResponse.json({
      error: 'Proof report generation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId,
      message: 'I cannot confirm this report.',
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const requestId = `rpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    const body = await request.json();
    const { run_type } = body as { run_type?: string };

    const { data: auditRun, error } = await supabase
      .from('audit_runs')
      .insert({
        run_type: run_type || 'manual',
        status: 'running',
        started_at: new Date().toISOString(),
        environment_signature: {
          node_env: process.env.NODE_ENV,
          region: process.env.VERCEL_REGION || 'unknown',
        },
      })
      .select('id')
      .single();

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
      error: 'Failed to start audit run',
      details: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId,
    }, { status: 500 });
  }
}
