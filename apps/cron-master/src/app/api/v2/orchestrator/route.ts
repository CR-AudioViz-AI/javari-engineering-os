import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
  'cravbarrels.vercel.app',
];

// FIXED: Always use absolute URL
const BASE_URL = 'https://javari-engineering-os.vercel.app';

interface OrchestrationResult {
  phase: string;
  domain?: string;
  success: boolean;
  duration_ms: number;
  data?: Record<string, unknown>;
  error?: string;
}

export async function POST(request: Request) {
  const requestId = `orch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startTime = Date.now();
  
  try {
    const supabase = getSupabase();
    const body = await request.json().catch(() => ({}));
    const { 
      phases = ['discovery', 'synthetic', 'security', 'coverage', 'report'],
      domains = ECOSYSTEM_DOMAINS,
      mode = 'full'
    } = body as { phases?: string[]; domains?: string[]; mode?: string };

    // Create audit run
    const { data: auditRun } = await supabase.from('audit_runs').insert({
      run_type: 'orchestrated',
      status: 'running',
      started_at: new Date().toISOString(),
      environment_signature: { mode, phases, domains_count: domains.length }
    }).select('id').single();

    const auditRunId = auditRun?.id;
    const results: OrchestrationResult[] = [];

    // Phase 1: Route Discovery
    if (phases.includes('discovery')) {
      for (const domain of domains) {
        const phaseStart = Date.now();
        try {
          const res = await fetch(`${BASE_URL}/api/v2/route-discovery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, audit_run_id: auditRunId }),
          });
          const data = await res.json();
          results.push({
            phase: 'discovery',
            domain,
            success: res.ok,
            duration_ms: Date.now() - phaseStart,
            data: { routes_discovered: data.routes_discovered || 0 }
          });
        } catch (e) {
          results.push({
            phase: 'discovery',
            domain,
            success: false,
            duration_ms: Date.now() - phaseStart,
            error: e instanceof Error ? e.message : 'Unknown error'
          });
        }
      }
    }

    // Phase 2: Synthetic Monitoring
    if (phases.includes('synthetic')) {
      for (const domain of domains) {
        const phaseStart = Date.now();
        try {
          const res = await fetch(`${BASE_URL}/api/v2/synthetic-monitor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, audit_run_id: auditRunId }),
          });
          const data = await res.json();
          results.push({
            phase: 'synthetic',
            domain,
            success: res.ok,
            duration_ms: Date.now() - phaseStart,
            data: { experience_score: data.result?.experience_score || 0 }
          });
        } catch (e) {
          results.push({
            phase: 'synthetic',
            domain,
            success: false,
            duration_ms: Date.now() - phaseStart,
            error: e instanceof Error ? e.message : 'Unknown error'
          });
        }
      }
    }

    // Phase 3: Security Scans
    if (phases.includes('security')) {
      for (const domain of domains) {
        const phaseStart = Date.now();
        try {
          const res = await fetch(`${BASE_URL}/api/v2/security-scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, audit_run_id: auditRunId }),
          });
          const data = await res.json();
          results.push({
            phase: 'security',
            domain,
            success: res.ok,
            duration_ms: Date.now() - phaseStart,
            data: { pass: data.result?.pass || false }
          });
        } catch (e) {
          results.push({
            phase: 'security',
            domain,
            success: false,
            duration_ms: Date.now() - phaseStart,
            error: e instanceof Error ? e.message : 'Unknown error'
          });
        }
      }
    }

    // Phase 4: Coverage Matrix
    if (phases.includes('coverage')) {
      const phaseStart = Date.now();
      try {
        const res = await fetch(`${BASE_URL}/api/v2/coverage-matrix?audit_run_id=${auditRunId}`);
        const data = await res.json();
        results.push({
          phase: 'coverage',
          success: res.ok,
          duration_ms: Date.now() - phaseStart,
          data: data.coverage_matrix?.totals || {}
        });
      } catch (e) {
        results.push({
          phase: 'coverage',
          success: false,
          duration_ms: Date.now() - phaseStart,
          error: e instanceof Error ? e.message : 'Unknown error'
        });
      }
    }

    // Update audit run
    const successCount = results.filter(r => r.success).length;
    await supabase.from('audit_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      coverage_pct: Math.round((successCount / results.length) * 100),
      overall_score: successCount > 0 ? 
        results.filter(r => r.success && r.data?.experience_score)
          .reduce((sum, r) => sum + (r.data?.experience_score as number || 0), 0) / 
          results.filter(r => r.data?.experience_score).length || 0 : 0
    }).eq('id', auditRunId);

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
        failed: results.length - successCount,
        success_rate: Math.round((successCount / results.length) * 100),
        total_duration_ms: Date.now() - startTime
      },
      results
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Orchestration failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId
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
