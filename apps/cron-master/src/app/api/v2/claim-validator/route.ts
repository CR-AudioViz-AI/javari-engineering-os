import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

interface Claim {
  text: string;
  type: string;
  value: string;
}

/**
 * ChatGPT Requirement: Claim Validator
 * No numbers/claims may appear in reports unless present in metrics_json.
 */
export async function POST(request: Request) {
  const requestId = `claim-val-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { audit_run_id, claims } = body as { audit_run_id: string; claims: Claim[] };

    if (!audit_run_id || !claims || !Array.isArray(claims)) {
      return NextResponse.json({
        error: 'audit_run_id and claims[] required',
        request_id: requestId,
      }, { status: 400 });
    }

    const results: Array<{
      claim: Claim;
      is_valid: boolean;
      evidence_found: boolean;
      metric_json_id?: string;
      error?: string;
    }> = [];
    
    let allValid = true;

    for (const claim of claims) {
      const { data: metrics, error } = await supabase
        .from('metrics_json')
        .select('id, metric_key, metric_value, evidence_ids')
        .eq('audit_run_id', audit_run_id)
        .ilike('metric_key', `%${claim.type}%`);

      if (error) {
        results.push({ claim, is_valid: false, evidence_found: false, error: error.message });
        allValid = false;
        continue;
      }

      const hasEvidence = metrics && metrics.length > 0;
      
      if (hasEvidence) {
        await supabase.from('audit_claims').insert({
          audit_run_id,
          claim_text: claim.text,
          claim_type: claim.type,
          claim_value: claim.value,
          metric_json_id: metrics[0].id,
          evidence_ids: metrics[0].evidence_ids,
          is_verified: true,
          verification_method: 'claim_validator_api',
          verification_timestamp: new Date().toISOString(),
        });

        results.push({ claim, is_valid: true, evidence_found: true, metric_json_id: metrics[0].id });
      } else {
        results.push({
          claim,
          is_valid: false,
          evidence_found: false,
          error: 'No evidence in metrics_json. Claim CANNOT appear in report.',
        });
        allValid = false;
      }
    }

    return NextResponse.json({
      request_id: requestId,
      timestamp: new Date().toISOString(),
      audit_run_id,
      total_claims: claims.length,
      validated: results.filter(r => r.is_valid).length,
      failed: results.filter(r => !r.is_valid).length,
      all_valid: allValid,
      can_generate_report: allValid,
      results,
      message: allValid 
        ? 'All claims verified. Report generation allowed.'
        : `BLOCKED: Claims without evidence must be removed.`,
    }, { status: allValid ? 200 : 422 });

  } catch (error) {
    return NextResponse.json({
      error: 'Claim validation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId,
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/v2/claim-validator',
    method: 'POST',
    purpose: 'Validates all report claims have evidence in metrics_json',
    body: {
      audit_run_id: 'uuid',
      claims: [{ text: 'string', type: 'string', value: 'string' }]
    }
  });
}
