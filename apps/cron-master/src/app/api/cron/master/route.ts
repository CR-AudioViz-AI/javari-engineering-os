import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BASE_URL = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : 'https://javari-engineering-os.vercel.app';

interface JobResult {
  job: string;
  status: 'success' | 'error' | 'skipped';
  duration_ms: number;
  result?: unknown;
  error?: string;
}

async function runJob(name: string, endpoint: string): Promise<JobResult> {
  const start = Date.now();
  
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    const data = await response.json();
    
    return {
      job: name,
      status: response.ok ? 'success' : 'error',
      duration_ms: Date.now() - start,
      result: data,
    };
  } catch (error) {
    return {
      job: name,
      status: 'error',
      duration_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runAll = searchParams.get('all') === 'true';
  const specificJob = searchParams.get('job');
  
  const startTime = Date.now();
  const results: JobResult[] = [];
  
  // Define all autonomous jobs
  const jobs = [
    { name: 'health_check', endpoint: '/api/health', interval: 5, description: 'System health monitoring' },
    { name: 'self_healing', endpoint: '/api/healing/redeploy', interval: 5, description: 'Auto-redeployment on failures' },
    { name: 'predictive_analysis', endpoint: '/api/intelligence/predict?hours=6', interval: 60, description: 'AI failure prediction' },
    { name: 'ecosystem_audit', endpoint: '/api/audit', interval: 30, description: 'Full ecosystem audit' },
    { name: 'dashboard_refresh', endpoint: '/api/dashboard', interval: 15, description: 'Dashboard metrics update' },
    { name: 'daily_report', endpoint: '/api/reports/daily', interval: 1440, description: 'Daily summary generation' },
    { name: 'weekly_report', endpoint: '/api/reports/weekly', interval: 10080, description: 'Weekly report generation' },
    { name: 'grant_proof', endpoint: '/api/reports/proof?days=7', interval: 1440, description: 'Grant documentation' },
  ];
  
  // Run specific job if requested
  if (specificJob) {
    const job = jobs.find(j => j.name === specificJob);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    
    const result = await runJob(job.name, job.endpoint);
    results.push(result);
  } else if (runAll) {
    // Run all jobs in parallel
    const jobPromises = jobs.map(job => runJob(job.name, job.endpoint));
    const jobResults = await Promise.all(jobPromises);
    results.push(...jobResults);
  } else {
    // Return job status without running
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      autonomous_mode: true,
      self_healing: true,
      predictive_analytics: true,
      jobs: jobs.map(j => ({
        name: j.name,
        endpoint: j.endpoint,
        interval_minutes: j.interval,
        description: j.description,
      })),
      capabilities: {
        auto_redeploy: 'Automatic redeployment on 503/500 errors',
        predictive_failure: 'AI-powered failure prediction using Claude',
        email_alerts: 'Real-time alerts via Resend',
        self_documenting: 'Automated daily/weekly reports',
        grant_proof: 'Automated activity logs for grant applications',
        multi_ai: 'OpenAI, Anthropic, Google AI routing',
      },
      usage: {
        run_all: `${BASE_URL}/api/cron/master?all=true`,
        run_specific: `${BASE_URL}/api/cron/master?job=health_check`,
      },
    });
  }
  
  // Log cron run
  await supabase.from('cron_runs').insert({
    run_type: runAll ? 'full' : 'specific',
    jobs_executed: results.length,
    successful: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'error').length,
    total_duration_ms: Date.now() - startTime,
    results,
    created_at: new Date().toISOString(),
  });
  
  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
    autonomous_mode: true,
    self_healing: true,
    summary: {
      total: results.length,
      successful: successCount,
      failed: errorCount,
      success_rate: `${((successCount / results.length) * 100).toFixed(1)}%`,
    },
    results,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { action, job } = body;
  
  if (action === 'trigger') {
    const result = await runJob(job, `/api/${job.replace('_', '/')}`);
    return NextResponse.json(result);
  }
  
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
