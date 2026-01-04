import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    endpoints: [
      '/api/v2/health',
      '/api/v2/claim-validator',
      '/api/v2/coverage-matrix',
      '/api/v2/route-discovery',
      '/api/v2/synthetic-monitor',
      '/api/v2/proof-report'
    ],
    description: 'Javari Engineering OS v2 - Proof-Grade Audit System',
    chatgpt_requirements: {
      claim_validator: 'No claims without evidence in metrics_json',
      coverage_matrix: 'Proves what % was actually audited',
      route_discovery: 'Full crawl + route discovery',
      synthetic_monitor: 'Hourly customer flow tests with Experience Score',
      proof_report: 'Evidence-only reporting'
    }
  });
}
