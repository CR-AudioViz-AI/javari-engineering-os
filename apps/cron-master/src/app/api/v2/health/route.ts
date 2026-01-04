import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    features: [
      'claim-validator',
      'coverage-matrix', 
      'route-discovery',
      'synthetic-monitor',
      'proof-report'
    ],
    message: 'Javari Engineering OS v2 - Proof-Grade Audit System'
  });
}
