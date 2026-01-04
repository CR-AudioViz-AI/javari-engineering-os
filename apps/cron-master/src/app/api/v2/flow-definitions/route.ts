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
 * ChatGPT Requirement: E2E Flow Definitions
 * 
 * Predefined flows for: signup, login, checkout, dashboard
 */
export async function POST(request: Request) {
  const requestId = `flow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { action, flow } = body as { 
      action: 'create' | 'seed_defaults';
      flow?: {
        flow_name: string;
        flow_type: string;
        domain: string;
        steps: Array<{ action: string; selector?: string; value?: string; url?: string; expected?: string }>;
        requires_auth?: boolean;
        requires_payment?: boolean;
        timeout_ms?: number;
      };
    };

    if (action === 'seed_defaults') {
      // Seed default flow definitions
      const defaultFlows = [
        {
          flow_name: 'Homepage Health Check',
          flow_type: 'health',
          domain: 'javariai.com',
          steps: [
            { action: 'navigate', url: 'https://javariai.com' },
            { action: 'wait', timeout_ms: 2000 },
            { action: 'assert_status', expected: '200' }
          ],
          requires_auth: false,
          requires_payment: false,
          timeout_ms: 30000
        },
        {
          flow_name: 'Login Flow',
          flow_type: 'auth',
          domain: 'javariai.com',
          steps: [
            { action: 'navigate', url: 'https://javariai.com/login' },
            { action: 'wait_for_selector', selector: 'input[type="email"]' },
            { action: 'fill', selector: 'input[type="email"]', value: '{{TEST_EMAIL}}' },
            { action: 'fill', selector: 'input[type="password"]', value: '{{TEST_PASSWORD}}' },
            { action: 'click', selector: 'button[type="submit"]' },
            { action: 'wait_for_navigation' },
            { action: 'assert_url', expected: '/dashboard' }
          ],
          requires_auth: false,
          requires_payment: false,
          timeout_ms: 60000
        },
        {
          flow_name: 'Dashboard Access',
          flow_type: 'dashboard',
          domain: 'javariai.com',
          steps: [
            { action: 'navigate', url: 'https://javariai.com/dashboard' },
            { action: 'wait_for_selector', selector: '.dashboard-content' },
            { action: 'assert_visible', selector: '.user-profile' }
          ],
          requires_auth: true,
          requires_payment: false,
          timeout_ms: 45000
        },
        {
          flow_name: 'Checkout Flow',
          flow_type: 'checkout',
          domain: 'javariai.com',
          steps: [
            { action: 'navigate', url: 'https://javariai.com/pricing' },
            { action: 'click', selector: '[data-plan="pro"]' },
            { action: 'wait_for_selector', selector: '.checkout-form' },
            { action: 'assert_visible', selector: '.stripe-element' }
          ],
          requires_auth: true,
          requires_payment: true,
          timeout_ms: 60000
        }
      ];

      let seeded = 0;
      for (const flowDef of defaultFlows) {
        const { error } = await supabase.from('flow_definitions').upsert(flowDef, {
          onConflict: 'domain,flow_type',
          ignoreDuplicates: false
        });
        if (!error) seeded++;
      }

      return NextResponse.json({
        request_id: requestId,
        timestamp: new Date().toISOString(),
        action: 'seed_defaults',
        flows_seeded: seeded,
        total_defaults: defaultFlows.length
      });
    }

    if (action === 'create' && flow) {
      const { data, error } = await supabase.from('flow_definitions').insert(flow).select('id').single();
      
      if (error) throw error;

      return NextResponse.json({
        request_id: requestId,
        timestamp: new Date().toISOString(),
        action: 'create',
        flow_id: data?.id,
        flow_name: flow.flow_name
      });
    }

    return NextResponse.json({
      error: 'Invalid action. Use "seed_defaults" or "create" with flow object.',
      request_id: requestId
    }, { status: 400 });

  } catch (error) {
    return NextResponse.json({
      error: 'Flow definition operation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId,
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const requestId = `flow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get('domain');
  const flowType = searchParams.get('flow_type');

  try {
    const supabase = getSupabase();
    
    let query = supabase.from('flow_definitions').select('*');
    if (domain) query = query.eq('domain', domain);
    if (flowType) query = query.eq('flow_type', flowType);
    
    const { data: flows } = await query;

    return NextResponse.json({
      request_id: requestId,
      total: flows?.length || 0,
      flows: flows || []
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to fetch flow definitions',
      request_id: requestId,
    }, { status: 500 });
  }
}
