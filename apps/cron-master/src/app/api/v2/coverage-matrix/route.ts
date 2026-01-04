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
 * ChatGPT Requirement: Coverage Matrix
 * Proves what % of the ecosystem was actually audited.
 */
export async function GET(request: Request) {
  const requestId = `cov-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { searchParams } = new URL(request.url);
  const auditRunId = searchParams.get('audit_run_id');
  const domain = searchParams.get('domain');

  try {
    const supabase = getSupabase();

    // Get registered assets
    const { data: registeredAssets } = await supabase
      .from('central_registry')
      .select('*')
      .eq('is_active', true);

    // Get route inventory
    let routeQuery = supabase.from('route_inventory').select('*');
    if (domain) routeQuery = routeQuery.eq('domain', domain);
    const { data: routes } = await routeQuery;

    // Get flow definitions
    let flowQuery = supabase.from('flow_definitions').select('*');
    if (domain) flowQuery = flowQuery.eq('domain', domain);
    const { data: flows } = await flowQuery;

    // Get coverage metrics
    let coverageQuery = supabase.from('coverage_metrics').select('*');
    if (auditRunId) coverageQuery = coverageQuery.eq('audit_run_id', auditRunId);
    if (domain) coverageQuery = coverageQuery.eq('domain', domain);
    const { data: coverageData } = await coverageQuery;

    // Calculate totals
    const totalRoutes = routes?.length || 0;
    const testedRoutes = routes?.filter(r => r.last_tested_at)?.length || 0;
    const totalFlows = flows?.length || 0;
    const testedFlows = coverageData?.reduce((sum, c) => sum + (c.flows_audited || 0), 0) || 0;

    const coveragePct = totalRoutes > 0 ? Math.round((testedRoutes / totalRoutes) * 100) : 0;
    const flowCoveragePct = totalFlows > 0 ? Math.round((testedFlows / totalFlows) * 100) : 0;

    // Store in metrics_json
    if (auditRunId) {
      await supabase.from('metrics_json').insert({
        audit_run_id: auditRunId,
        metric_key: 'coverage_matrix',
        metric_value: {
          routes_discovered: totalRoutes,
          routes_audited: testedRoutes,
          coverage_pct: coveragePct,
          flows_defined: totalFlows,
          flows_audited: testedFlows,
        },
        computed_from: ['route_inventory', 'flow_definitions', 'coverage_metrics'],
      });
    }

    return NextResponse.json({
      request_id: requestId,
      timestamp: new Date().toISOString(),
      audit_run_id: auditRunId,
      coverage: {
        registered_assets: registeredAssets?.length || 0,
        routes: { discovered: totalRoutes, audited: testedRoutes, coverage_pct: coveragePct },
        flows: { defined: totalFlows, audited: testedFlows, coverage_pct: flowCoveragePct },
      },
      by_domain: coverageData || [],
      message: coveragePct < 80 
        ? `WARNING: Only ${coveragePct}% coverage. Cannot claim full audit.`
        : `Coverage acceptable: ${coveragePct}%`,
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Coverage matrix failed',
      details: error instanceof Error ? error.message : 'Unknown',
      request_id: requestId,
    }, { status: 500 });
  }
}
