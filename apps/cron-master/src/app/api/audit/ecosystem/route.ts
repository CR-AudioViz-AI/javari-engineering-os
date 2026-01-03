import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ECOSYSTEM = [
  { repo: 'craudiovizai-website', url: 'https://craudiovizai.com', critical: true },
  { repo: 'javari-engineering-os', url: 'https://javari-engineering-os.vercel.app', critical: true },
  { repo: 'crav-javari', url: 'https://crav-javari.vercel.app', critical: true },
  { repo: 'javari-spirits', url: 'https://javari-spirits.vercel.app', critical: false },
  { repo: 'market-oracle', url: 'https://market-oracle.vercel.app', critical: false },
];

interface SiteResult {
  repo: string;
  url: string;
  status: 'healthy' | 'warning' | 'error' | 'offline';
  responseTime: number;
  statusCode: number;
  issues: string[];
}

async function checkSite(config: { repo: string; url: string; critical: boolean }): Promise<SiteResult> {
  const start = Date.now();
  const issues: string[] = [];
  let status: SiteResult['status'] = 'healthy';
  let statusCode = 0;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(config.url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'Javari-Audit/1.0' },
    });

    clearTimeout(timeout);
    statusCode = response.status;

    if (!response.ok) {
      status = 'error';
      issues.push(`HTTP ${statusCode} error`);
    }
  } catch (error) {
    status = 'offline';
    issues.push('Site unreachable');
  }

  const responseTime = Date.now() - start;

  if (status === 'healthy' && responseTime > 5000) {
    status = 'warning';
    issues.push(`Slow response: ${responseTime}ms`);
  }

  return {
    repo: config.repo,
    url: config.url,
    status,
    responseTime,
    statusCode,
    issues,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const feedToAI = searchParams.get('ai') === 'true';

  const startTime = Date.now();

  try {
    const results = await Promise.all(ECOSYSTEM.map(checkSite));

    const summary = {
      total: results.length,
      healthy: results.filter(r => r.status === 'healthy').length,
      warning: results.filter(r => r.status === 'warning').length,
      error: results.filter(r => r.status === 'error').length,
      offline: results.filter(r => r.status === 'offline').length,
      total_issues: results.reduce((sum, r) => sum + r.issues.length, 0),
    };

    // Store audit run
    await supabase.from('audit_runs').insert({
      audit_type: 'ecosystem',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      issues_found: summary.total_issues,
      status: summary.offline > 0 ? 'CRITICAL' : summary.error > 0 ? 'ERROR' : 'SUCCESS',
      results: { summary, sites: results },
    }).catch(() => {});

    // Build AI prompt if requested
    let aiAnalysis = null;
    if (feedToAI && process.env.OPENAI_API_KEY) {
      const prompt = `Analyze this CR AudioViz AI ecosystem audit:

Summary: ${summary.healthy}/${summary.total} healthy, ${summary.warning} warnings, ${summary.error} errors, ${summary.offline} offline

Sites:
${results.map(r => `- ${r.repo}: ${r.status} (${r.responseTime}ms) ${r.issues.length > 0 ? '- Issues: ' + r.issues.join(', ') : ''}`).join('\n')}

Provide:
1. Top 3 priorities to fix
2. Specific action items
3. Preventive recommendations`;

      try {
        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: 'You are a DevOps expert. Be concise and actionable.' },
              { role: 'user', content: prompt },
            ],
            max_tokens: 1000,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          aiAnalysis = aiData.choices?.[0]?.message?.content;
        }
      } catch (e) {
        console.error('AI analysis error:', e);
      }
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      summary,
      sites: results,
      ai_analysis: aiAnalysis,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
