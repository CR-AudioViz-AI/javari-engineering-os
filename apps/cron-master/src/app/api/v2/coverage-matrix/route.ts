import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';

/**
 * ChatGPT Requirement: Coverage Matrix
 * 
 * Proves what % of the ecosystem was actually audited.
 * Per domain/app shows:
 * - routes discovered vs audited
 * - flows audited
 * - API endpoints tested
 * - auth/payment/a11y coverage
 * 
 * Without this, we cannot claim we audited "everything".
 */
export async function GET(request: Request) {
  const requestId = `cov-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { searchParams } = new URL(request.url);
  const auditRunId = searchParams.get('audit_run_id');
  const domain = searchParams.get('domain');

  try {
    // Get all registered assets from central_registry
    const { data: registeredAssets, error: regError } = await supabase
      .from('central_registry')
      .select('*')
      .eq('is_active', true);

    if (regError) throw regError;

    // Get route inventory
    let routeQuery = supabase.from('route_inventory').select('*');
    if (domain) routeQuery = routeQuery.eq('domain', domain);
    const { data: routes, error: routeError } = await routeQuery;
    if (routeError) throw routeError;

    // Get flow definitions
    let flowQuery = supabase.from('flow_definitions').select('*');
    if (domain) flowQuery = flowQuery.eq('domain', domain);
    const { data: flows, error: flowError } = await flowQuery;
    if (flowError) throw flowError;

    // Get coverage metrics for audit run
    let coverageQuery = supabase.from('coverage_metrics').select('*');
    if (auditRunId) coverageQuery = coverageQuery.eq('audit_run_id', auditRunId);
    if (domain) coverageQuery = coverageQuery.eq('domain', domain);
    const { data: coverageData, error: covError } = await coverageQuery;
    if (covError) throw covError;

    // Calculate coverage per domain
    const domainStats: Record<string, {
      domain: string;
      routes_discovered: number;
      routes_audited: number;
      routes_coverage_pct: number;
      flows_defined: number;
      flows_audited: number;
      flows_coverage_pct: number;
      api_endpoints: number;
      api_tested: number;
      api_coverage_pct: number;
      auth_coverage_pct: number;
      payment_coverage_pct: number;
      a11y_coverage_pct: number;
      overall_coverage_pct: number;
    }> = {};

    // Group routes by domain
    const routesByDomain = (routes || []).reduce((acc, route) => {
      if (!acc[route.domain]) acc[route.domain] = [];
      acc[route.domain].push(route);
      return acc;
    }, {} as Record<string, typeof routes>);

    // Group flows by domain
    const flowsByDomain = (flows || []).reduce((acc, flow) => {
      if (!acc[flow.domain]) acc[flow.domain] = [];
      acc[flow.domain].push(flow);
      return acc;
    }, {} as Record<string, typeof flows>);

    // Calculate stats per domain
    for (const dom of Object.keys(routesByDomain)) {
      const domRoutes = routesByDomain[dom] || [];
      const domFlows = flowsByDomain[dom] || [];
      const domCoverage = (coverageData || []).find(c => c.domain === dom);

      const routesDiscovered = domRoutes.length;
      const routesAudited = domRoutes.filter(r => r.last_tested_at).length;
      const apiRoutes = domRoutes.filter(r => r.route_type === 'api');
      const apiTested = apiRoutes.filter(r => r.last_tested_at).length;

      domainStats[dom] = {
        domain: dom,
        routes_discovered: routesDiscovered,
        routes_audited: routesAudited,
        routes_coverage_pct: routesDiscovered > 0 ? Math.round((routesAudited / routesDiscovered) * 100) : 0,
        flows_defined: domFlows.length,
        flows_audited: domCoverage?.flows_audited || 0,
        flows_coverage_pct: domFlows.length > 0 ? Math.round(((domCoverage?.flows_audited || 0) / domFlows.length) * 100) : 0,
        api_endpoints: apiRoutes.length,
        api_tested: apiTested,
        api_coverage_pct: apiRoutes.length > 0 ? Math.round((apiTested / apiRoutes.length) * 100) : 0,
        auth_coverage_pct: domCoverage?.auth_coverage_pct || 0,
        payment_coverage_pct: domCoverage?.payment_coverage_pct || 0,
        a11y_coverage_pct: domCoverage?.a11y_coverage_pct || 0,
        overall_coverage_pct: domCoverage?.overall_coverage_pct || 0,
      };
    }

    // Calculate totals
    const totals = {
      total_registered_assets: registeredAssets?.length || 0,
      total_domains: Object.keys(domainStats).length,
      total_routes_discovered: Object.values(domainStats).reduce((sum, d) => sum + d.routes_discovered, 0),
      total_routes_audited: Object.values(domainStats).reduce((sum, d) => sum + d.routes_audited, 0),
      total_flows_defined: Object.values(domainStats).reduce((sum, d) => sum + d.flows_defined, 0),
      total_flows_audited: Object.values(domainStats).reduce((sum, d) => sum + d.flows_audited, 0),
      overall_routes_coverage_pct: 0,
      overall_flows_coverage_pct: 0,
    };

    totals.overall_routes_coverage_pct = totals.total_routes_discovered > 0 
      ? Math.round((totals.total_routes_audited / totals.total_routes_discovered) * 100) 
      : 0;
    totals.overall_flows_coverage_pct = totals.total_flows_defined > 0 
      ? Math.round((totals.total_flows_audited / totals.total_flows_defined) * 100) 
      : 0;

    // Store in metrics_json for claim validation
    if (auditRunId) {
      await supabase.from('metrics_json').insert({
        audit_run_id: auditRunId,
        metric_key: 'coverage_matrix',
        metric_value: { totals, by_domain: domainStats },
        computed_from: ['central_registry', 'route_inventory', 'flow_definitions', 'coverage_metrics'],
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      request_id: requestId,
      timestamp: new Date().toISOString(),
      audit_run_id: auditRunId,
      coverage_matrix: {
        totals,
        by_domain: Object.values(domainStats),
      },
      message: totals.overall_routes_coverage_pct < 80 
        ? `WARNING: Only ${totals.overall_routes_coverage_pct}% route coverage. Cannot claim "full audit".`
        : `Coverage acceptable: ${totals.overall_routes_coverage_pct}% of discovered routes audited.`,
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Coverage matrix generation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId,
      message: 'I cannot confirm coverage metrics.',
    }, { status: 500 });
  }
}
