import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendAlert } from '@/lib/email-alerts';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

interface RepoAuditResult {
  repo: string;
  status: 'healthy' | 'warning' | 'error' | 'offline';
  deploymentUrl?: string;
  lastCommit?: string;
  lastDeployment?: string;
  issues: Array<{
    type: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    message: string;
  }>;
  metrics?: {
    responseTime?: number;
    statusCode?: number;
  };
}

interface EcosystemAuditResult {
  timestamp: string;
  duration_ms: number;
  summary: {
    total_repos: number;
    healthy: number;
    warning: number;
    error: number;
    offline: number;
    total_issues: number;
    critical_issues: number;
  };
  repos: RepoAuditResult[];
  ai_analysis_prompt: string;
}

// CR AudioViz AI Ecosystem repos and their deployment URLs
const ECOSYSTEM = [
  { repo: 'craudiovizai-website', url: 'https://craudiovizai.com', critical: true },
  { repo: 'javari-engineering-os', url: 'https://javari-engineering-os.vercel.app', critical: true },
  { repo: 'crav-javari', url: 'https://crav-javari.vercel.app', critical: true },
  { repo: 'javari-spirits', url: 'https://javari-spirits.vercel.app', critical: false },
  { repo: 'market-oracle', url: 'https://market-oracle.vercel.app', critical: false },
  { repo: 'mortgage-rate-monitor', url: 'https://mortgage-rate-monitor.vercel.app', critical: false },
  { repo: 'javari-cards', url: 'https://javari-cards.vercel.app', critical: false },
  { repo: 'javari-key', url: 'https://javari-key.vercel.app', critical: false },
  { repo: 'javari-travel', url: 'https://javari-travel.vercel.app', critical: false },
  { repo: 'crai-games', url: 'https://crai-games.vercel.app', critical: false },
  { repo: 'email-validation-tool', url: 'https://email-validation-tool.vercel.app', critical: false },
  { repo: 'seo-analyzer', url: 'https://seo-analyzer.vercel.app', critical: false },
];

async function checkUrl(url: string): Promise<{ ok: boolean; status: number; responseTime: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'Javari-Audit/1.0' },
    });
    
    clearTimeout(timeout);
    return {
      ok: response.ok,
      status: response.status,
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      responseTime: Date.now() - start,
    };
  }
}

async function getRepoInfo(repo: string): Promise<{ lastCommit?: string; lastCommitDate?: string }> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/CR-AudioViz-AI/${repo}/commits?per_page=1`,
      {
        headers: {
          'Authorization': `token ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );
    
    if (!response.ok) return {};
    
    const commits = await response.json();
    if (commits.length > 0) {
      return {
        lastCommit: commits[0].sha.substring(0, 7),
        lastCommitDate: commits[0].commit.author.date,
      };
    }
    return {};
  } catch {
    return {};
  }
}

async function getDeploymentInfo(repo: string): Promise<{ url?: string; state?: string; createdAt?: string }> {
  try {
    const response = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${repo}&teamId=${process.env.VERCEL_TEAM_ID}&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.VERCEL_TOKEN}`,
        },
      }
    );
    
    if (!response.ok) return {};
    
    const data = await response.json();
    if (data.deployments?.length > 0) {
      const deployment = data.deployments[0];
      return {
        url: deployment.url,
        state: deployment.state,
        createdAt: deployment.createdAt,
      };
    }
    return {};
  } catch {
    return {};
  }
}

async function auditRepo(config: { repo: string; url: string; critical: boolean }): Promise<RepoAuditResult> {
  const issues: RepoAuditResult['issues'] = [];
  let status: RepoAuditResult['status'] = 'healthy';

  // Check URL
  const urlCheck = await checkUrl(config.url);
  
  // Get repo info
  const repoInfo = await getRepoInfo(config.repo);
  
  // Analyze results
  if (!urlCheck.ok) {
    if (urlCheck.status === 0) {
      status = 'offline';
      issues.push({
        type: 'availability',
        severity: config.critical ? 'CRITICAL' : 'HIGH',
        message: `Site is offline or unreachable`,
      });
    } else {
      status = 'error';
      issues.push({
        type: 'http_error',
        severity: config.critical ? 'CRITICAL' : 'HIGH',
        message: `HTTP ${urlCheck.status} error`,
      });
    }
  } else if (urlCheck.responseTime > 5000) {
    status = 'warning';
    issues.push({
      type: 'performance',
      severity: 'MEDIUM',
      message: `Slow response time: ${urlCheck.responseTime}ms`,
    });
  } else if (urlCheck.responseTime > 3000) {
    issues.push({
      type: 'performance',
      severity: 'LOW',
      message: `Response time could be improved: ${urlCheck.responseTime}ms`,
    });
  }

  // Check for stale deployments
  if (repoInfo.lastCommitDate) {
    const daysSinceCommit = (Date.now() - new Date(repoInfo.lastCommitDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCommit > 30) {
      issues.push({
        type: 'staleness',
        severity: 'LOW',
        message: `No commits in ${Math.floor(daysSinceCommit)} days`,
      });
    }
  }

  return {
    repo: config.repo,
    status: issues.length === 0 ? 'healthy' : status,
    deploymentUrl: config.url,
    lastCommit: repoInfo.lastCommit,
    issues,
    metrics: {
      responseTime: urlCheck.responseTime,
      statusCode: urlCheck.status,
    },
  };
}

function generateAIPrompt(result: EcosystemAuditResult): string {
  return `You are an AI engineering assistant analyzing the CR AudioViz AI ecosystem audit results.

## ECOSYSTEM AUDIT REPORT
Timestamp: ${result.timestamp}
Duration: ${result.duration_ms}ms

## SUMMARY
- Total Repositories: ${result.summary.total_repos}
- Healthy: ${result.summary.healthy}
- Warning: ${result.summary.warning}
- Error: ${result.summary.error}
- Offline: ${result.summary.offline}
- Total Issues: ${result.summary.total_issues}
- Critical Issues: ${result.summary.critical_issues}

## DETAILED RESULTS
${result.repos.map(r => `
### ${r.repo}
- Status: ${r.status.toUpperCase()}
- URL: ${r.deploymentUrl}
- Response Time: ${r.metrics?.responseTime}ms
- Last Commit: ${r.lastCommit || 'Unknown'}
- Issues: ${r.issues.length === 0 ? 'None' : r.issues.map(i => `
  - [${i.severity}] ${i.type}: ${i.message}`).join('')}
`).join('\n')}

## YOUR TASK
1. Analyze these results and identify the top 3 priorities
2. For each issue, provide a specific actionable fix
3. Estimate effort (hours) for each fix
4. Identify any patterns or systemic issues
5. Recommend preventive measures

Format your response as:
## TOP PRIORITIES
1. [Priority with specific repo and issue]
2. [Priority]
3. [Priority]

## ACTION PLAN
[Detailed steps for each priority]

## SYSTEMIC RECOMMENDATIONS
[Patterns and preventive measures]
`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sendEmail = searchParams.get('email') === 'true';
  const feedToAI = searchParams.get('ai') === 'true';
  
  const startTime = Date.now();

  try {
    // Run all audits in parallel
    const auditPromises = ECOSYSTEM.map(config => auditRepo(config));
    const repos = await Promise.all(auditPromises);

    // Calculate summary
    const summary = {
      total_repos: repos.length,
      healthy: repos.filter(r => r.status === 'healthy').length,
      warning: repos.filter(r => r.status === 'warning').length,
      error: repos.filter(r => r.status === 'error').length,
      offline: repos.filter(r => r.status === 'offline').length,
      total_issues: repos.reduce((sum, r) => sum + r.issues.length, 0),
      critical_issues: repos.reduce((sum, r) => sum + r.issues.filter(i => i.severity === 'CRITICAL').length, 0),
    };

    const result: EcosystemAuditResult = {
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      summary,
      repos,
      ai_analysis_prompt: '',
    };

    // Generate AI prompt
    result.ai_analysis_prompt = generateAIPrompt(result);

    // Store in database
    await supabase.from('audit_runs').insert({
      audit_type: 'ecosystem_full',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: result.duration_ms,
      issues_found: summary.total_issues,
      status: summary.critical_issues > 0 ? 'CRITICAL' : summary.error > 0 ? 'ERROR' : 'SUCCESS',
      results: result,
    }).catch(() => {});

    // Store issues
    for (const repo of repos) {
      for (const issue of repo.issues) {
        await supabase.from('audit_issues').insert({
          title: `[${repo.repo}] ${issue.message}`,
          severity: issue.severity,
          category: issue.type,
          target_repo: repo.repo,
          target_url: repo.deploymentUrl,
          details: issue,
        }).catch(() => {});
      }
    }

    // Send email if critical issues found or requested
    if (sendEmail || summary.critical_issues > 0) {
      await sendAlert({
        title: `Ecosystem Audit: ${summary.critical_issues} Critical Issues`,
        message: `Audit completed for ${summary.total_repos} repositories.

Healthy: ${summary.healthy}
Warning: ${summary.warning}
Error: ${summary.error}
Offline: ${summary.offline}

${summary.critical_issues > 0 ? `⚠️ CRITICAL ISSUES REQUIRE IMMEDIATE ATTENTION` : 'No critical issues found.'}`,
        severity: summary.critical_issues > 0 ? 'CRITICAL' : summary.error > 0 ? 'HIGH' : 'INFO',
        source: 'Ecosystem Audit',
        details: { summary },
        actionUrl: 'https://javari-engineering-os.vercel.app/api/audit/ecosystem',
        actionLabel: 'View Full Audit',
      });
    }

    // If AI analysis requested, call OpenAI
    let aiAnalysis = null;
    if (feedToAI && process.env.OPENAI_API_KEY) {
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
              {
                role: 'system',
                content: 'You are an expert DevOps engineer analyzing system health reports. Provide actionable, specific recommendations.',
              },
              {
                role: 'user',
                content: result.ai_analysis_prompt,
              },
            ],
            max_tokens: 2000,
            temperature: 0.7,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          aiAnalysis = aiData.choices?.[0]?.message?.content;
        }
      } catch (error) {
        console.error('AI analysis error:', error);
      }
    }

    return NextResponse.json({
      ...result,
      ai_analysis: aiAnalysis,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    }, { status: 500 });
  }
}

/**
 * POST /api/audit/ecosystem
 * Trigger a full ecosystem audit with options
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { email = true, ai = true } = body;
  
  // Redirect to GET with params
  const url = new URL(request.url);
  url.searchParams.set('email', String(email));
  url.searchParams.set('ai', String(ai));
  
  return GET(new Request(url.toString()));
}
