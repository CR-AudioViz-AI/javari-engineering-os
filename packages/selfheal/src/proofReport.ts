/**
 * JAVARI ENGINEERING OS - PROOF REPORT
 * Generates evidence that autonomous monitoring works 24x7x365
 * 
 * This is how we PROVE Javari is really watching over the platform
 */

import fs from 'node:fs';
import path from 'node:path';
import { supabaseAdmin } from '@javari/shared';

// ==========================================================================
// TYPES
// ==========================================================================

interface Gap {
  start: string;
  end: string;
  minutes: number;
}

interface RunSample {
  id: string;
  created_at: string;
  status: string;
  job_id: string;
  heartbeat: boolean;
  issues_detected_count: number;
  fixes_applied_count: number;
  verification_passed: boolean;
  summary?: string;
}

interface ProofReport {
  generated_at: string;
  window_hours: number;
  
  summary: {
    total_runs: number;
    successes: number;
    failures: number;
    degraded: number;
    uptime_pct: number;
    heartbeat_count: number;
    expected_heartbeats: number;
  };
  
  gaps: Gap[];
  max_gap_minutes: number;
  
  issues_detected: number;
  fixes_applied: number;
  
  sample_runs: RunSample[];
  
  verification: {
    heartbeat_continuous: boolean;
    uptime_threshold_met: boolean;
    no_critical_gaps: boolean;
    overall_healthy: boolean;
  };
}

// ==========================================================================
// HELPERS
// ==========================================================================

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function outPath(...parts: string[]): string {
  return path.join(process.cwd(), 'output', ...parts);
}

function computeGaps(runs: RunSample[]): Gap[] {
  if (runs.length < 2) return [];

  const gaps: Gap[] = [];
  const sorted = [...runs].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = new Date(sorted[i].created_at).getTime();
    const next = new Date(sorted[i + 1].created_at).getTime();
    const diffMinutes = (next - current) / 60000;

    if (diffMinutes > 2) {
      gaps.push({
        start: sorted[i].created_at,
        end: sorted[i + 1].created_at,
        minutes: Math.round(diffMinutes * 10) / 10,
      });
    }
  }

  return gaps.sort((a, b) => b.minutes - a.minutes);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c] as string));
}

// ==========================================================================
// HTML GENERATION
// ==========================================================================

function generateHTML(report: ProofReport): string {
  const statusColor = report.verification.overall_healthy ? '#1f6f43' : '#b00020';
  const statusText = report.verification.overall_healthy ? '✅ HEALTHY' : '⚠️ NEEDS ATTENTION';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Javari Self-Healing Proof Report</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 24px; background: #fafafa; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #1a1a1a; }
    .status-badge { 
      display: inline-block; 
      padding: 8px 16px; 
      border-radius: 4px; 
      color: white;
      background: ${statusColor};
      font-weight: bold;
    }
    .card { background: white; border-radius: 8px; padding: 20px; margin: 16px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .metric { text-align: center; padding: 16px; }
    .metric-value { font-size: 32px; font-weight: bold; color: #1a1a1a; }
    .metric-label { color: #666; font-size: 14px; margin-top: 4px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f5f5f5; font-weight: 600; }
    .success { color: #1f6f43; }
    .fail { color: #b00020; }
    pre { background: #f5f5f5; padding: 16px; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🤖 Javari Self-Healing Proof Report</h1>
    <p><b>Generated:</b> ${report.generated_at}</p>
    <p><b>Window:</b> ${report.window_hours} hours</p>
    <p class="status-badge">${statusText}</p>

    <div class="card">
      <h2>📊 Summary</h2>
      <div class="grid">
        <div class="metric">
          <div class="metric-value">${report.summary.uptime_pct}%</div>
          <div class="metric-label">Uptime</div>
        </div>
        <div class="metric">
          <div class="metric-value">${report.summary.total_runs}</div>
          <div class="metric-label">Total Runs</div>
        </div>
        <div class="metric">
          <div class="metric-value success">${report.summary.successes}</div>
          <div class="metric-label">Successes</div>
        </div>
        <div class="metric">
          <div class="metric-value fail">${report.summary.failures}</div>
          <div class="metric-label">Failures</div>
        </div>
        <div class="metric">
          <div class="metric-value">${report.summary.heartbeat_count}</div>
          <div class="metric-label">Heartbeats</div>
        </div>
        <div class="metric">
          <div class="metric-value">${report.max_gap_minutes}</div>
          <div class="metric-label">Max Gap (min)</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>✅ Verification</h2>
      <ul>
        <li>${report.verification.heartbeat_continuous ? '✅' : '❌'} Heartbeat Continuous</li>
        <li>${report.verification.uptime_threshold_met ? '✅' : '❌'} Uptime ≥ 99.5%</li>
        <li>${report.verification.no_critical_gaps ? '✅' : '❌'} No Critical Gaps</li>
        <li>${report.verification.overall_healthy ? '✅' : '❌'} Overall Healthy</li>
      </ul>
    </div>

    <div class="card">
      <h2>📜 Recent Runs</h2>
      <table>
        <thead><tr><th>Time</th><th>Status</th><th>Heartbeat</th><th>Issues</th><th>Fixes</th></tr></thead>
        <tbody>
          ${report.sample_runs.slice(-20).reverse().map(r => `
            <tr>
              <td>${r.created_at}</td>
              <td class="${r.status.toLowerCase()}">${r.status}</td>
              <td>${r.heartbeat ? '💓' : ''}</td>
              <td>${r.issues_detected_count}</td>
              <td>${r.fixes_applied_count}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

// ==========================================================================
// MAIN GENERATOR
// ==========================================================================

export async function generateProofReport(hours = 24): Promise<ProofReport> {
  const supa = supabaseAdmin();
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  const { data: runs } = await supa
    .from('autonomous_runs')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  const allRuns = (runs || []) as RunSample[];
  const heartbeatRuns = allRuns.filter(r => r.heartbeat);

  const total = allRuns.length;
  const successes = allRuns.filter(r => r.status === 'SUCCESS').length;
  const failures = allRuns.filter(r => r.status === 'FAIL').length;
  const degraded = allRuns.filter(r => r.status === 'DEGRADED').length;
  
  const expectedHeartbeats = hours * 60;
  const uptimePct = total > 0 ? Math.round((successes / total) * 1000) / 10 : 0;

  const gaps = computeGaps(heartbeatRuns);
  const maxGap = gaps.length > 0 ? Math.max(...gaps.map(g => g.minutes)) : 0;

  const issuesDetected = allRuns.reduce((s, r) => s + (r.issues_detected_count || 0), 0);
  const fixesApplied = allRuns.reduce((s, r) => s + (r.fixes_applied_count || 0), 0);

  const report: ProofReport = {
    generated_at: new Date().toISOString(),
    window_hours: hours,
    summary: {
      total_runs: total,
      successes,
      failures,
      degraded,
      uptime_pct: uptimePct,
      heartbeat_count: heartbeatRuns.length,
      expected_heartbeats: expectedHeartbeats,
    },
    gaps,
    max_gap_minutes: maxGap,
    issues_detected: issuesDetected,
    fixes_applied: fixesApplied,
    sample_runs: allRuns.slice(-50),
    verification: {
      heartbeat_continuous: gaps.length === 0,
      uptime_threshold_met: uptimePct >= 99.5,
      no_critical_gaps: maxGap < 5,
      overall_healthy: gaps.length === 0 && uptimePct >= 99.5 && failures === 0,
    },
  };

  ensureDir(outPath());
  fs.writeFileSync(outPath('self_healing_proof.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(outPath('self_healing_proof.html'), generateHTML(report));

  return report;
}

// ==========================================================================
// PROOF TESTS
// ==========================================================================

export interface ProofTestResult {
  pass: boolean;
  failures: string[];
  report: ProofReport;
}

export async function runProofTests(hours = 24): Promise<ProofTestResult> {
  const report = await generateProofReport(hours);
  const failures: string[] = [];

  if (report.summary.uptime_pct < 99.5) {
    failures.push(`Uptime below threshold: ${report.summary.uptime_pct}% < 99.5%`);
  }

  if (report.max_gap_minutes > 5) {
    failures.push(`Gap detected > 5 minutes: ${report.max_gap_minutes} min`);
  }

  const expectedMinRuns = Math.floor(hours * 60 * 0.9);
  if (report.summary.total_runs < expectedMinRuns) {
    failures.push(`Too few runs: ${report.summary.total_runs} < ${expectedMinRuns}`);
  }

  if (report.summary.failures > 0) {
    failures.push(`${report.summary.failures} failed runs detected`);
  }

  return {
    pass: failures.length === 0,
    failures,
    report,
  };
}

export { ProofReport, Gap, RunSample };
