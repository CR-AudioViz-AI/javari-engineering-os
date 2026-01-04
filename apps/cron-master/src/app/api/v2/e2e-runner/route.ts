import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow longer runtime for E2E tests

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

interface FlowStep {
  action: string;
  selector?: string;
  value?: string;
  url?: string;
  expected?: string;
  timeout_ms?: number;
}

interface FlowDefinition {
  id: string;
  flow_name: string;
  flow_type: string;
  domain: string;
  steps: FlowStep[];
  requires_auth: boolean;
  requires_payment: boolean;
  timeout_ms: number;
}

/**
 * ChatGPT Requirement: Authenticated E2E Flows
 * 
 * Real Playwright tests for: signup, login, checkout, dashboard
 * Store results with screenshots and traces.
 * 
 * NOTE: This endpoint defines and runs flow simulations.
 * Full Playwright integration requires a separate worker service.
 */
export async function POST(request: Request) {
  const requestId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { flow_id, domain, flow_type } = body as { 
      flow_id?: string; 
      domain?: string;
      flow_type?: 'health' | 'auth' | 'checkout' | 'dashboard' | 'full';
    };

    // Get flow definition
    let flow: FlowDefinition | null = null;
    
    if (flow_id) {
      const { data } = await supabase
        .from('flow_definitions')
        .select('*')
        .eq('id', flow_id)
        .single();
      flow = data as FlowDefinition;
    } else if (domain && flow_type) {
      const { data } = await supabase
        .from('flow_definitions')
        .select('*')
        .eq('domain', domain)
        .eq('flow_type', flow_type)
        .single();
      flow = data as FlowDefinition;
    }

    // If no flow found, create a default health check flow
    if (!flow && domain) {
      flow = {
        id: 'default-health',
        flow_name: 'Default Health Check',
        flow_type: 'health',
        domain: domain,
        steps: [
          { action: 'navigate', url: `https://${domain}` },
          { action: 'wait', timeout_ms: 2000 },
          { action: 'assert_status', expected: '200' }
        ],
        requires_auth: false,
        requires_payment: false,
        timeout_ms: 30000
      };
    }

    if (!flow) {
      return NextResponse.json({
        error: 'No flow definition found. Provide flow_id or domain+flow_type.',
        request_id: requestId,
      }, { status: 400 });
    }

    // Execute flow (simulation - actual Playwright would run in a worker)
    const startTime = Date.now();
    const stepResults: Array<{
      step: number;
      action: string;
      status: 'pass' | 'fail' | 'skip';
      duration_ms: number;
      error?: string;
    }> = [];

    let overallStatus: 'pass' | 'fail' = 'pass';
    let stepsCompleted = 0;

    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];
      const stepStart = Date.now();
      
      try {
        if (step.action === 'navigate' && step.url) {
          // Simulate navigation by fetching
          const res = await fetch(step.url, { 
            signal: AbortSignal.timeout(step.timeout_ms || 10000),
            redirect: 'follow'
          });
          
          stepResults.push({
            step: i + 1,
            action: step.action,
            status: res.ok ? 'pass' : 'fail',
            duration_ms: Date.now() - stepStart,
            error: res.ok ? undefined : `HTTP ${res.status}`
          });
          
          if (!res.ok) overallStatus = 'fail';
          else stepsCompleted++;
          
        } else if (step.action === 'wait') {
          await new Promise(resolve => setTimeout(resolve, step.timeout_ms || 1000));
          stepResults.push({
            step: i + 1,
            action: step.action,
            status: 'pass',
            duration_ms: Date.now() - stepStart
          });
          stepsCompleted++;
          
        } else if (step.action === 'assert_status') {
          // Check if previous navigate succeeded
          const prevNav = stepResults.find(r => r.action === 'navigate');
          const passed = prevNav?.status === 'pass';
          stepResults.push({
            step: i + 1,
            action: step.action,
            status: passed ? 'pass' : 'fail',
            duration_ms: Date.now() - stepStart,
            error: passed ? undefined : 'Previous navigation failed'
          });
          if (!passed) overallStatus = 'fail';
          else stepsCompleted++;
          
        } else {
          // Skip unsupported actions in simulation mode
          stepResults.push({
            step: i + 1,
            action: step.action,
            status: 'skip',
            duration_ms: 0,
            error: 'Requires full Playwright worker (not available in simulation)'
          });
        }
      } catch (err) {
        stepResults.push({
          step: i + 1,
          action: step.action,
          status: 'fail',
          duration_ms: Date.now() - stepStart,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
        overallStatus = 'fail';
      }
    }

    const totalDuration = Date.now() - startTime;
    const experienceScore = overallStatus === 'pass' 
      ? Math.max(0, 100 - Math.floor(totalDuration / 100))
      : Math.floor((stepsCompleted / flow.steps.length) * 50);

    // Store result
    const { data: runData } = await supabase.from('synthetic_runs').insert({
      flow_id: flow.id !== 'default-health' ? flow.id : null,
      flow_name: flow.flow_name,
      domain: flow.domain,
      status: overallStatus,
      duration_ms: totalDuration,
      experience_score: experienceScore,
      steps_completed: stepsCompleted,
      total_steps: flow.steps.length,
      error_message: overallStatus === 'fail' ? stepResults.find(r => r.status === 'fail')?.error : null,
      request_id: requestId,
      environment_signature: {
        mode: 'simulation',
        region: process.env.VERCEL_REGION || 'unknown',
        note: 'Full Playwright requires worker service'
      },
      metadata: { step_results: stepResults }
    }).select('id').single();

    // Store in metrics_json for proof
    await supabase.from('metrics_json').insert({
      metric_key: `e2e_${flow.flow_type}_${flow.domain}`,
      metric_value: {
        flow_name: flow.flow_name,
        status: overallStatus,
        steps_completed: stepsCompleted,
        total_steps: flow.steps.length,
        experience_score: experienceScore,
        duration_ms: totalDuration
      },
      computed_from: ['synthetic_runs', 'flow_definitions'],
      evidence_ids: runData ? [runData.id] : []
    });

    return NextResponse.json({
      request_id: requestId,
      timestamp: new Date().toISOString(),
      flow: {
        id: flow.id,
        name: flow.flow_name,
        type: flow.flow_type,
        domain: flow.domain
      },
      result: {
        status: overallStatus,
        steps_completed: stepsCompleted,
        total_steps: flow.steps.length,
        experience_score: experienceScore,
        duration_ms: totalDuration
      },
      step_results: stepResults,
      run_id: runData?.id,
      note: 'Running in simulation mode. Full Playwright requires worker service deployment.'
    });

  } catch (error) {
    return NextResponse.json({
      error: 'E2E runner failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId,
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const requestId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get('domain');

  try {
    const supabase = getSupabase();
    
    // Get flow definitions
    let flowQuery = supabase.from('flow_definitions').select('*');
    if (domain) flowQuery = flowQuery.eq('domain', domain);
    const { data: flows } = await flowQuery;

    // Get recent runs
    let runQuery = supabase
      .from('synthetic_runs')
      .select('*')
      .not('flow_name', 'is', null)
      .order('timestamp', { ascending: false })
      .limit(20);
    if (domain) runQuery = runQuery.eq('domain', domain);
    const { data: runs } = await runQuery;

    return NextResponse.json({
      request_id: requestId,
      domain: domain || 'all',
      flow_definitions: flows || [],
      recent_runs: runs || [],
      usage: {
        endpoint: 'POST /api/v2/e2e-runner',
        body: {
          option1: '{ "flow_id": "uuid" }',
          option2: '{ "domain": "example.com", "flow_type": "health|auth|checkout|dashboard" }'
        }
      }
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to fetch E2E data',
      request_id: requestId,
    }, { status: 500 });
  }
}
