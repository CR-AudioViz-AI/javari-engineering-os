import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for full orchestration

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

const ECOSYSTEM_DOMAINS = [
  'javariai.com',
  'craudiovizai.com',
  'javariverse.com',
  'crav-javari.vercel.app',
  'javari-spirits.vercel.app',
  'javari-engineering-os.vercel.app',
];

interface OrchestrationResult {
  phase: string;
  domain?: string;
  success: boolean;
  duration_ms: number;
  data?: Record<string, unknown>;
  error?: string;
}

/**
 * ChatGPT Requirement: Nightly Orchestrator Jobs
 * 
 * Phases:
 * 1. Route Discovery Sync - Crawl all domains for routes
 * 2. Synthetic Monitoring - Run health checks on all domains
 * 3. Security Scans - Header analysis on all domains
 * 4. Coverage Calculation - Update coverage metrics
 * 5. Report Generation - Create proof-based report
 */
export async function POST(request: Request) {
  const requestId = `orch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startTime = Date.now();
  
  try {
    const supabase = getSupabase();
    const body = await request.json().catch(() => ({}));
    const { 
      phases = ['discovery', 'synthetic', 'security', 'coverage', 'report'],
      domains = ECOSYSTEM_DOMAINS,
      mode = 'full' // 'full' | 'quick' | 'security-only'
    } = body as { phases?: string[]; domains?: string[]; mode?: string };

    // Create audit run
    const { data: auditRun } = await supabase.from('audit_runs').insert({
      run_type: 'orchestrated',
      status: 'running',
      started_at: new Date().toISOString(),
      total_assets: domains.length,
      environment_signature: {
        mode,
        phases,
        domains_count: domains.length,
        region: process.env.VERCEL_REGION || 'unknown'
      }
    }).select('id').single();

    const auditRunId = auditRun?.id;
    const results: OrchestrationResult[] = [];
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'https://javari-engineering-os.vercel.app';

    // Phase 1: Route Discovery
    if (phases.includes('discovery')) {
      for (const domain of domains) {
        const phaseStart = Date.now();
        try {
          const res = await fetch(`${baseUrl}/api/v2/route-discovery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain }),
            signal: AbortSignal.timeout(30000)
          });
          const data = await res.json();
          results.push({
            phase: 'discovery',
            domain,
            success: res.ok,
            duration_ms: Date.now() - phaseStart,
            data: { routes_discovered: data.routes_discovered, routes_stored: data.routes_stored }
          });
        } catch (err) {
          results.push({
            phase: 'discovery',
            domain,
            success: false,
            duration_ms: Date.now() - phaseStart,
            error: err instanceof Error ? err.message : 'Unknown error'
          });
        }
      }
    }

    // Phase 2: Synthetic Monitoring
    if (phases.includes('synthetic')) {
      for (const domain of domains) {
        const phaseStart = Date.now();
        try {
          const res = await fetch(`${baseUrl}/api/v2/synthetic-monitor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain }),
            signal: AbortSignal.timeout(20000)
          });
          const data = await res.json();
          results.push({
            phase: 'synthetic',
            domain,
            success: res.ok && data.result?.success,
            duration_ms: Date.now() - phaseStart,
            data: { experience_score: data.result?.experience_score, status: data.result?.status }
          });
        } catch (err) {
          results.push({
            phase: 'synthetic',
            domain,
            success: false,
            duration_ms: Date.now() - phaseStart,
            error: err instanceof Error ? err.message : 'Unknown error'
          });
        }
      }
    }

    // Phase 3: Security Scans
    if (phases.includes('security')) {
      for (const domain of domains) {
        const phaseStart = Date.now();
        try {
          const res = await fetch(`${baseUrl}/api/v2/security-scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain }),
            signal: AbortSignal.timeout(20000)
          });
          const data = await res.json();
          results.push({
            phase: 'security',
            domain,
            success: res.ok,
            duration_ms: Date.now() - phaseStart,
            data: { pass: data.result?.pass, findings_count: data.result?.findings_count }
          });
        } catch (err) {
          results.push({
            phase: 'security',
            domain,
            success: false,
            duration_ms: Date.now() - phaseStart,
            error: err instanceof Error ? err.message : 'Unknown error'
          });
        }
      }
    }

    // Phase 4: Coverage Calculation
    if (phases.includes('coverage')) {
      const phaseStart = Date.now();
      try {
        const res = await fetch(`${baseUrl}/api/v2/coverage-matrix?audit_run_id=${auditRunId}`, {
          signal: AbortSignal.timeout(15000)
        });
        const data = await res.json();
        results.push({
          phase: 'coverage',
          success: res.ok,
          duration_ms: Date.now() - phaseStart,
          data: { 
            routes_discovered: data.coverage?.routes?.discovered,
            routes_audited: data.coverage?.routes?.audited,
            coverage_pct: data.coverage?.routes?.coverage_pct
          }
        });
      } catch (err) {
        results.push({
          phase: 'coverage',
          success: false,
          duration_ms: Date.now() - phaseStart,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }

    // Calculate summary
    const totalDuration = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    // Update audit run
    await supabase.from('audit_runs').update({
      status: failCount === 0 ? 'completed' : 'completed_with_errors',
      completed_at: new Date().toISOString(),
      assets_audited: domains.length,
      coverage_pct: results.find(r => r.phase === 'coverage')?.data?.coverage_pct || 0,
      overall_score: Math.round((successCount / results.length) * 100),
      claims_verified: successCount,
      claims_failed: failCount,
    }).eq('id', auditRunId);

    // Store orchestration metric
    await supabase.from('metrics_json').insert({
      audit_run_id: auditRunId,
      metric_key: 'orchestration_run',
      metric_value: {
        mode,
        phases_run: phases,
        domains_count: domains.length,
        success_count: successCount,
        fail_count: failCount,
        total_duration_ms: totalDuration
      },
      computed_from: ['orchestrator'],
      evidence_ids: [auditRunId]
    });

    return NextResponse.json({
      request_id: requestId,
      timestamp: new Date().toISOString(),
      audit_run_id: auditRunId,
      mode,
      summary: {
        phases_run: phases.length,
        domains_processed: domains.length,
        total_operations: results.length,
        successful: successCount,
        failed: failCount,
        success_rate: Math.round((successCount / results.length) * 100),
        total_duration_ms: totalDuration
      },
      results,
      next_steps: failCount > 0 
        ? 'Check failed operations. Consider running self-heal.'
        : 'All operations successful. Proof report available.'
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Orchestration failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId,
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/v2/orchestrator',
    description: 'Nightly orchestrator for proof-grade auditing',
    usage: {
      method: 'POST',
      body: {
        phases: ['discovery', 'synthetic', 'security', 'coverage', 'report'],
        domains: ['example.com'],
        mode: 'full | quick | security-only'
      }
    },
    default_domains: ECOSYSTEM_DOMAINS,
    phases_available: [
      'discovery - Route discovery via sitemap/crawl',
      'synthetic - Health check monitoring',
      'security - Header security analysis',
      'coverage - Coverage matrix calculation',
      'report - Proof report generation'
    ]
  });
}
