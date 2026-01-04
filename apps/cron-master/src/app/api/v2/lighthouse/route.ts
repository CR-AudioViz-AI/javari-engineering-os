import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

interface LighthouseResult {
  performance: number;
  accessibility: number;
  best_practices: number;
  seo: number;
  lcp_ms: number;
  cls: number;
  tbt_ms: number;
  fcp_ms: number;
  si_ms: number;
  ttfb_ms: number;
}

/**
 * ChatGPT Requirement: Lighthouse CI
 * 
 * Run Lighthouse audits, store results, enforce budgets.
 * Using PageSpeed Insights API for real Lighthouse data.
 */
export async function POST(request: Request) {
  const requestId = `lh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { url, domain, strategy = 'mobile', budget } = body as { 
      url?: string;
      domain?: string;
      strategy?: 'mobile' | 'desktop';
      budget?: {
        performance?: number;
        accessibility?: number;
        lcp_ms?: number;
        cls?: number;
      };
    };

    const targetUrl = url || (domain ? `https://${domain}` : null);
    if (!targetUrl) {
      return NextResponse.json({
        error: 'url or domain required',
        request_id: requestId,
      }, { status: 400 });
    }

    const targetDomain = domain || new URL(targetUrl).hostname;

    // Use PageSpeed Insights API (free, no key required for basic usage)
    const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(targetUrl)}&strategy=${strategy}&category=performance&category=accessibility&category=best-practices&category=seo`;

    let lighthouseData: LighthouseResult | null = null;
    let psiError: string | null = null;

    try {
      const psiRes = await fetch(psiUrl, { signal: AbortSignal.timeout(45000) });
      
      if (psiRes.ok) {
        const psiData = await psiRes.json();
        const categories = psiData.lighthouseResult?.categories || {};
        const audits = psiData.lighthouseResult?.audits || {};

        lighthouseData = {
          performance: Math.round((categories.performance?.score || 0) * 100),
          accessibility: Math.round((categories.accessibility?.score || 0) * 100),
          best_practices: Math.round((categories['best-practices']?.score || 0) * 100),
          seo: Math.round((categories.seo?.score || 0) * 100),
          lcp_ms: Math.round(audits['largest-contentful-paint']?.numericValue || 0),
          cls: parseFloat((audits['cumulative-layout-shift']?.numericValue || 0).toFixed(3)),
          tbt_ms: Math.round(audits['total-blocking-time']?.numericValue || 0),
          fcp_ms: Math.round(audits['first-contentful-paint']?.numericValue || 0),
          si_ms: Math.round(audits['speed-index']?.numericValue || 0),
          ttfb_ms: Math.round(audits['server-response-time']?.numericValue || 0),
        };
      } else {
        psiError = `PageSpeed API returned ${psiRes.status}`;
      }
    } catch (err) {
      psiError = err instanceof Error ? err.message : 'PageSpeed API failed';
    }

    // Check budget
    const budgetResults: Array<{ metric: string; actual: number; budget: number; pass: boolean }> = [];
    let budgetPass = true;

    if (lighthouseData && budget) {
      if (budget.performance !== undefined) {
        const pass = lighthouseData.performance >= budget.performance;
        budgetResults.push({ metric: 'performance', actual: lighthouseData.performance, budget: budget.performance, pass });
        if (!pass) budgetPass = false;
      }
      if (budget.accessibility !== undefined) {
        const pass = lighthouseData.accessibility >= budget.accessibility;
        budgetResults.push({ metric: 'accessibility', actual: lighthouseData.accessibility, budget: budget.accessibility, pass });
        if (!pass) budgetPass = false;
      }
      if (budget.lcp_ms !== undefined) {
        const pass = lighthouseData.lcp_ms <= budget.lcp_ms;
        budgetResults.push({ metric: 'lcp_ms', actual: lighthouseData.lcp_ms, budget: budget.lcp_ms, pass });
        if (!pass) budgetPass = false;
      }
      if (budget.cls !== undefined) {
        const pass = lighthouseData.cls <= budget.cls;
        budgetResults.push({ metric: 'cls', actual: lighthouseData.cls, budget: budget.cls, pass });
        if (!pass) budgetPass = false;
      }
    }

    // Store results
    let recordId: string | null = null;
    if (lighthouseData) {
      const { data } = await supabase.from('performance_metrics').insert({
        domain: targetDomain,
        url: targetUrl,
        strategy,
        performance_score: lighthouseData.performance,
        accessibility_score: lighthouseData.accessibility,
        best_practices_score: lighthouseData.best_practices,
        seo_score: lighthouseData.seo,
        lcp_ms: lighthouseData.lcp_ms,
        cls: lighthouseData.cls,
        tbt_ms: lighthouseData.tbt_ms,
        fcp_ms: lighthouseData.fcp_ms,
        si_ms: lighthouseData.si_ms,
        ttfb_ms: lighthouseData.ttfb_ms,
        budget_pass: budgetPass,
        budget_results: budgetResults.length > 0 ? budgetResults : null,
        request_id: requestId,
      }).select('id').single();
      recordId = data?.id;

      // Store in metrics_json for proof
      await supabase.from('metrics_json').insert({
        metric_key: `lighthouse_${targetDomain}_${strategy}`,
        metric_value: lighthouseData,
        computed_from: ['pagespeed_insights_api'],
        evidence_ids: recordId ? [recordId] : [],
      });
    }

    return NextResponse.json({
      request_id: requestId,
      timestamp: new Date().toISOString(),
      url: targetUrl,
      domain: targetDomain,
      strategy,
      scores: lighthouseData ? {
        performance: lighthouseData.performance,
        accessibility: lighthouseData.accessibility,
        best_practices: lighthouseData.best_practices,
        seo: lighthouseData.seo,
      } : null,
      core_web_vitals: lighthouseData ? {
        lcp_ms: lighthouseData.lcp_ms,
        cls: lighthouseData.cls,
        tbt_ms: lighthouseData.tbt_ms,
        fcp_ms: lighthouseData.fcp_ms,
        ttfb_ms: lighthouseData.ttfb_ms,
      } : null,
      budget: budgetResults.length > 0 ? {
        pass: budgetPass,
        results: budgetResults,
      } : null,
      record_id: recordId,
      error: psiError,
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Lighthouse audit failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId,
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const requestId = `lh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get('domain');

  try {
    const supabase = getSupabase();
    
    let query = supabase
      .from('performance_metrics')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(20);
    if (domain) query = query.eq('domain', domain);
    const { data: metrics } = await query;

    // Calculate averages
    const avgScores = metrics && metrics.length > 0 ? {
      performance: Math.round(metrics.reduce((s, m) => s + (m.performance_score || 0), 0) / metrics.length),
      accessibility: Math.round(metrics.reduce((s, m) => s + (m.accessibility_score || 0), 0) / metrics.length),
      lcp_ms: Math.round(metrics.reduce((s, m) => s + (m.lcp_ms || 0), 0) / metrics.length),
    } : null;

    return NextResponse.json({
      request_id: requestId,
      domain: domain || 'all',
      total_audits: metrics?.length || 0,
      averages: avgScores,
      recent_audits: metrics || [],
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to fetch Lighthouse data',
      request_id: requestId,
    }, { status: 500 });
  }
}
