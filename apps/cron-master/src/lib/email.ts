// ═══════════════════════════════════════════════════════════════════════════════
// JAVARI ENGINEERING OS - EMAIL NOTIFICATION SERVICE
// ═══════════════════════════════════════════════════════════════════════════════
// Sends alerts for critical issues, daily summaries, and weekly reports
// ═══════════════════════════════════════════════════════════════════════════════

import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY 
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const ALERT_EMAIL = process.env.ALERT_EMAIL || 'royhenderson@craudiovizai.com';
const FROM_EMAIL = 'Javari Engineering <alerts@craudiovizai.com>';

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AlertType = 'issue' | 'deployment_failed' | 'health_check' | 'pr_created' | 'daily_summary' | 'weekly_report';

interface AlertPayload {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  details?: Record<string, unknown>;
  actionUrl?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEND ALERT EMAIL
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendAlert(payload: AlertPayload): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!resend) {
    console.log('[EMAIL] Resend not configured, skipping email');
    return { success: false, error: 'Resend not configured' };
  }

  // Only email for CRITICAL and HIGH severity
  if (payload.severity !== 'CRITICAL' && payload.severity !== 'HIGH') {
    console.log(`[EMAIL] Skipping ${payload.severity} alert (only CRITICAL/HIGH trigger emails)`);
    return { success: true, id: 'skipped' };
  }

  const severityEmoji = {
    CRITICAL: '🚨',
    HIGH: '⚠️',
    MEDIUM: '📋',
    LOW: 'ℹ️',
  };

  const subject = `${severityEmoji[payload.severity]} [${payload.severity}] ${payload.title}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${payload.severity === 'CRITICAL' ? '#dc2626' : '#f59e0b'}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; }
    .footer { background: #1f2937; color: #9ca3af; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }
    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 15px; }
    .details { background: white; padding: 15px; border-radius: 6px; margin-top: 15px; border: 1px solid #e5e7eb; }
    .details pre { background: #1f2937; color: #10b981; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
    h1 { margin: 0; font-size: 24px; }
    h2 { color: #374151; font-size: 18px; margin-top: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${severityEmoji[payload.severity]} ${payload.severity} ALERT</h1>
    </div>
    <div class="content">
      <h2>${payload.title}</h2>
      <p>${payload.message}</p>
      
      ${payload.details ? `
      <div class="details">
        <strong>Details:</strong>
        <pre>${JSON.stringify(payload.details, null, 2)}</pre>
      </div>
      ` : ''}
      
      ${payload.actionUrl ? `
      <a href="${payload.actionUrl}" class="button">View Details →</a>
      ` : ''}
    </div>
    <div class="footer">
      <p>Javari Engineering OS | CR AudioViz AI, LLC</p>
      <p>Automated 24x7 Monitoring System</p>
    </div>
  </div>
</body>
</html>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ALERT_EMAIL,
      subject,
      html,
    });

    if (error) {
      console.error('[EMAIL] Failed to send:', error);
      return { success: false, error: error.message };
    }

    console.log(`[EMAIL] Alert sent: ${data?.id}`);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[EMAIL] Exception:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendCriticalAlert(title: string, message: string, details?: Record<string, unknown>) {
  return sendAlert({
    type: 'issue',
    severity: 'CRITICAL',
    title,
    message,
    details,
    actionUrl: 'https://javari-engineering-os.vercel.app/api/dashboard',
  });
}

export async function sendDeploymentFailedAlert(repo: string, error: string, deploymentUrl?: string) {
  return sendAlert({
    type: 'deployment_failed',
    severity: 'HIGH',
    title: `Deployment Failed: ${repo}`,
    message: `A deployment has failed and requires attention.`,
    details: { repository: repo, error, timestamp: new Date().toISOString() },
    actionUrl: deploymentUrl,
  });
}

export async function sendPRCreatedAlert(repo: string, prNumber: number, prUrl: string, title: string) {
  return sendAlert({
    type: 'pr_created',
    severity: 'HIGH',
    title: `PR Created: ${title}`,
    message: `A new pull request has been created by Javari AI and needs review.`,
    details: { repository: repo, pr_number: prNumber, pr_title: title },
    actionUrl: prUrl,
  });
}

export async function sendHealthCheckFailedAlert(service: string, error: string) {
  return sendAlert({
    type: 'health_check',
    severity: 'CRITICAL',
    title: `Health Check Failed: ${service}`,
    message: `The ${service} service is not responding or has failed its health check.`,
    details: { service, error, timestamp: new Date().toISOString() },
    actionUrl: 'https://javari-engineering-os.vercel.app/api/health',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DAILY SUMMARY EMAIL
// ═══════════════════════════════════════════════════════════════════════════════

interface DailySummary {
  date: string;
  totalRuns: number;
  successfulRuns: number;
  issuesFound: number;
  issuesResolved: number;
  prsCreated: number;
  prsMerged: number;
}

export async function sendDailySummary(summary: DailySummary): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!resend) {
    return { success: false, error: 'Resend not configured' };
  }

  const successRate = summary.totalRuns > 0 
    ? Math.round((summary.successfulRuns / summary.totalRuns) * 100) 
    : 100;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #059669; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; }
    .footer { background: #1f2937; color: #9ca3af; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }
    .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }
    .stat { background: white; padding: 15px; border-radius: 8px; text-align: center; border: 1px solid #e5e7eb; }
    .stat-value { font-size: 32px; font-weight: bold; color: #059669; }
    .stat-label { color: #6b7280; font-size: 12px; text-transform: uppercase; }
    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; }
    h1 { margin: 0; font-size: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Daily Engineering Summary</h1>
      <p style="margin: 5px 0 0 0; opacity: 0.9;">${summary.date}</p>
    </div>
    <div class="content">
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-value">${summary.totalRuns}</div>
          <div class="stat-label">Job Runs</div>
        </div>
        <div class="stat">
          <div class="stat-value">${successRate}%</div>
          <div class="stat-label">Success Rate</div>
        </div>
        <div class="stat">
          <div class="stat-value">${summary.issuesFound}</div>
          <div class="stat-label">Issues Found</div>
        </div>
        <div class="stat">
          <div class="stat-value">${summary.issuesResolved}</div>
          <div class="stat-label">Issues Resolved</div>
        </div>
        <div class="stat">
          <div class="stat-value">${summary.prsCreated}</div>
          <div class="stat-label">PRs Created</div>
        </div>
        <div class="stat">
          <div class="stat-value">${summary.prsMerged}</div>
          <div class="stat-label">PRs Merged</div>
        </div>
      </div>
      <p style="text-align: center;">
        <a href="https://javari-engineering-os.vercel.app/api/reports/daily?date=${summary.date}" class="button">View Full Report →</a>
      </p>
    </div>
    <div class="footer">
      <p>Javari Engineering OS | CR AudioViz AI, LLC</p>
      <p>Automated 24x7 Monitoring System</p>
    </div>
  </div>
</body>
</html>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: ALERT_EMAIL,
      subject: `📊 Daily Summary: ${summary.date} | ${successRate}% Success Rate`,
      html,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
