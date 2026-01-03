/**
 * JAVARI ENGINEERING OS - HEALTH CHECK
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const checks: Record<string, { status: string; latency_ms?: number; error?: string }> = {};
  
  // Check Supabase
  const supaStart = Date.now();
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    
    if (!url || !key) {
      checks.supabase = { status: 'error', error: 'Missing credentials' };
    } else {
      const supa = createClient(url, key);
      const { error } = await supa.from('autonomous_jobs').select('id').limit(1);
      
      checks.supabase = {
        status: error ? 'error' : 'ok',
        latency_ms: Date.now() - supaStart,
        error: error?.message,
      };
    }
  } catch (err) {
    checks.supabase = {
      status: 'error',
      latency_ms: Date.now() - supaStart,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  
  // Check environment variables
  const requiredEnvs = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'GITHUB_TOKEN',
  ];
  
  const missingEnvs = requiredEnvs.filter((env) => !process.env[env]);
  checks.environment = {
    status: missingEnvs.length === 0 ? 'ok' : 'warning',
    error: missingEnvs.length > 0 ? `Missing: ${missingEnvs.join(', ')}` : undefined,
  };
  
  // Overall status
  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  
  return NextResponse.json({
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    checks,
  });
}

export const runtime = 'nodejs';
