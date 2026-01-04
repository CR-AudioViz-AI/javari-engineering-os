import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';

interface Claim {
  text: string;
  type: string;
  value: string;
}

interface ValidationResult {
  claim: Claim;
  is_valid: boolean;
  evidence_found: boolean;
  metric_json_id?: string;
  error?: string;
}

/**
 * ChatGPT Requirement: Claim Validator
 * 
 * This endpoint validates that ALL claims in a report are backed by
 * entries in metrics_json. If ANY claim cannot be verified, it returns
 * a failure with details on what's missing.
 * 
 * Non-negotiable rule: No numbers/claims may appear in reports unless
 * derived from raw evidence records and present in metrics_json.
 */
export async function POST(request: Request) {
  const requestId = `claim-val-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    const body = await request.json();
    const { audit_run_id, claims } = body as { audit_run_id: string; claims: Claim[] };

    if (!audit_run_id || !claims || !Array.isArray(claims)) {
      return NextResponse.json({
        error: 'audit_run_id and claims[] required',
        request_id: requestId,
      }, { status: 400 });
    }

    const results: ValidationResult[] = [];
    let allValid = true;
    const validatedClaimIds: string[] = [];
    const failedClaims: ValidationResult[] = [];

    for (const claim of claims) {
      // Search metrics_json for evidence supporting this claim
      const { data: metrics, error } = await supabase
        .from('metrics_json')
        .select('id, metric_key, metric_value, evidence_ids')
        .eq('audit_run_id', audit_run_id)
        .or(`metric_key.ilike.%${claim.type}%,metric_value.cs.{"value":"${claim.value}"}`);

      if (error) {
        results.push({
          claim,
          is_valid: false,
          evidence_found: false,
          error: error.message,
        });
        allValid = false;
        continue;
      }

      const hasEvidence = metrics && metrics.length > 0;
      
      if (hasEvidence) {
        // Record the validated claim
        const { data: insertedClaim } = await supabase
          .from('audit_claims')
          .insert({
            audit_run_id,
            claim_text: claim.text,
            claim_type: claim.type,
            claim_value: claim.value,
            metric_json_id: metrics[0].id,
            evidence_ids: metrics[0].evidence_ids,
            is_verified: true,
            verification_method: 'claim_validator_api',
            verification_timestamp: new Date().toISOString(),
          })
          .select('id')
          .single();

        results.push({
          claim,
          is_valid: true,
          evidence_found: true,
          metric_json_id: metrics[0].id,
        });
        
        if (insertedClaim) {
          validatedClaimIds.push(insertedClaim.id);
        }
      } else {
        // CLAIM FAILED - no evidence in metrics_json
        results.push({
          claim,
          is_valid: false,
          evidence_found: false,
          error: 'No supporting evidence found in metrics_json. This claim CANNOT appear in report.',
        });
        allValid = false;
        failedClaims.push({
          claim,
          is_valid: false,
          evidence_found: false,
        });
      }
    }

    // If any claims failed, this is a BLOCKING error
    const response = {
      request_id: requestId,
      timestamp: new Date().toISOString(),
      audit_run_id,
      total_claims: claims.length,
      validated_claims: results.filter(r => r.is_valid).length,
      failed_claims: failedClaims.length,
      all_valid: allValid,
      can_generate_report: allValid,
      results,
      message: allValid 
        ? 'All claims verified. Report generation allowed.'
        : `BLOCKED: ${failedClaims.length} claim(s) have no evidence in metrics_json. These MUST be removed from the report.`,
    };

    return NextResponse.json(response, { 
      status: allValid ? 200 : 422 
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Claim validation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId,
      message: 'I cannot confirm this claim validation.',
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/v2/claim-validator',
    purpose: 'ChatGPT Requirement: Validates all report claims have evidence in metrics_json',
    rule: 'No numbers/claims allowed in reports unless present in metrics_json',
    usage: {
      method: 'POST',
      body: {
        audit_run_id: 'uuid',
        claims: [
          { text: '100% uptime', type: 'uptime', value: '100' },
          { text: '85/100 score', type: 'score', value: '85' },
        ],
      },
    },
    response: {
      all_valid: 'boolean - if false, report MUST NOT be generated',
      can_generate_report: 'boolean',
      failed_claims: 'array of claims without evidence',
    },
  });
}
