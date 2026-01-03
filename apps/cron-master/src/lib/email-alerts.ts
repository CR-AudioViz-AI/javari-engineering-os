/**
 * Javari Engineering OS - Email Alert Service
 * Sends critical alerts, daily digests, and reports to Roy
 * 
 * Timestamp: Saturday, January 03, 2026 | 12:30 PM EST
 */

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const ALERT_EMAIL = process.env.ALERT_EMAIL || 'royhenderson@craudiovizai.com';
const FROM_EMAIL = 'Javari AI <alerts@craudiovizai.com>';

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface AlertPayload {
  title: string;
  message: string;
  severity: AlertSeverity;
  source?: string;
  details?: Record<string, unknown>;
  actionUrl?: string;
  actionLabel?: string;
}

export interface DigestPayload {
  period: 'daily' | 'weekly';
  summary: {
    uptime: string;
    jobsRun: number;
    jobsSucceeded: number;
    issuesFound: number;
    issuesResolved: number;
    prsCreated: number;
    prsMerged: number;
  };
  highlights: string[];
  issues: Array<{
    title: string;
    severity: string;
    status: string;
  }>;
  nextActions?: string[];
}

/**
 * Get severity color for email styling
 */
function getSeverityColor(severity: AlertSeverity): string {
  const colors = {
    CRITICAL: '#dc2626',
    HIGH: '#ea580c',
    MEDIUM: '#ca8a04',
    LOW: '#2563eb',
    INFO: '#059669',
  };
  return colors[severity] || '#6b7280';
}

/**
 * Get severity emoji
 */
function getSeverityEmoji(severity: AlertSeverity): string {
  const emojis = {
    CRITICAL: '🚨',
    HIGH: '⚠️',
    MEDIUM: '📢',
    LOW: '📝',
    INFO: 'ℹ️',
  };
  return emojis[severity] || '📌';
}

/**
 * Send an alert email
 */
export async function sendAlert(payload: AlertPayload): Promise<{ success: boolean; error?: string }> {
  const { title, message, severity, source, details, actionUrl, actionLabel } = payload;
  const color = getSeverityColor(severity);
  const emoji = getSeverityEmoji(severity);
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emoji} ${severity} Alert</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <tr>
      <td>
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${color}; border-radius: 8px 8px 0 0;">
          <tr>
            <td style="padding: 24px; color: white;">
              <h1 style="margin: 0; font-size: 24px;">${emoji} ${severity} ALERT</h1>
              <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 16px;">${title}</p>
            </td>
          </tr>
        </table>
        
        <!-- Content -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: white; border: 1px solid #e5e7eb; border-top: none;">
          <tr>
            <td style="padding: 24px;">
              <p style="margin: 0 0 16px 0; color: #374151; font-size: 14px;">
                <strong>Time:</strong> ${timestamp} EST
              </p>
              ${source ? `<p style="margin: 0 0 16px 0; color: #374151; font-size: 14px;"><strong>Source:</strong> ${source}</p>` : ''}
              
              <div style="background-color: #f9fafb; border-left: 4px solid ${color}; padding: 16px; margin: 16px 0;">
                <p style="margin: 0; color: #1f2937; font-size: 15px; line-height: 1.6;">${message}</p>
              </div>
              
              ${details ? `
              <div style="margin: 16px 0;">
                <p style="margin: 0 0 8px 0; color: #374151; font-weight: 600;">Details:</p>
                <pre style="background-color: #1f2937; color: #e5e7eb; padding: 16px; border-radius: 6px; overflow-x: auto; font-size: 12px; line-height: 1.5;">${JSON.stringify(details, null, 2)}</pre>
              </div>
              ` : ''}
              
              ${actionUrl ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                <tr>
                  <td>
                    <a href="${actionUrl}" style="display: inline-block; background-color: ${color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">${actionLabel || 'View Details'}</a>
                  </td>
                </tr>
              </table>
              ` : ''}
            </td>
          </tr>
        </table>
        
        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1f2937; border-radius: 0 0 8px 8px;">
          <tr>
            <td style="padding: 16px 24px; color: #9ca3af; font-size: 12px;">
              <p style="margin: 0;">Javari Engineering OS • CR AudioViz AI, LLC</p>
              <p style="margin: 8px 0 0 0;">
                <a href="https://javari-engineering-os.vercel.app/api/dashboard" style="color: #60a5fa; text-decoration: none;">Dashboard</a> •
                <a href="https://javari-engineering-os.vercel.app/api/reports/daily" style="color: #60a5fa; text-decoration: none;">Daily Report</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: ALERT_EMAIL,
      subject: `${emoji} [${severity}] ${title}`,
      html,
    });

    if (result.error) {
      console.error('Resend error:', result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Send a daily/weekly digest email
 */
export async function sendDigest(payload: DigestPayload): Promise<{ success: boolean; error?: string }> {
  const { period, summary, highlights, issues, nextActions } = payload;
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const periodLabel = period === 'daily' ? 'Daily' : 'Weekly';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>📊 ${periodLabel} Digest</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <tr>
      <td>
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1e40af; border-radius: 8px 8px 0 0;">
          <tr>
            <td style="padding: 24px; color: white;">
              <h1 style="margin: 0; font-size: 24px;">📊 ${periodLabel} Engineering Digest</h1>
              <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">${timestamp} EST</p>
            </td>
          </tr>
        </table>
        
        <!-- Summary Stats -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: white; border: 1px solid #e5e7eb; border-top: none;">
          <tr>
            <td style="padding: 24px;">
              <h2 style="margin: 0 0 16px 0; color: #1f2937; font-size: 18px;">📈 Summary</h2>
              
              <table width="100%" cellpadding="8" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px;">
                <tr>
                  <td style="border-bottom: 1px solid #e5e7eb;"><strong>Uptime</strong></td>
                  <td style="border-bottom: 1px solid #e5e7eb; text-align: right; color: #059669; font-weight: bold;">${summary.uptime}</td>
                </tr>
                <tr>
                  <td style="border-bottom: 1px solid #e5e7eb;"><strong>Jobs Run</strong></td>
                  <td style="border-bottom: 1px solid #e5e7eb; text-align: right;">${summary.jobsRun} (${summary.jobsSucceeded} succeeded)</td>
                </tr>
                <tr>
                  <td style="border-bottom: 1px solid #e5e7eb;"><strong>Issues Found</strong></td>
                  <td style="border-bottom: 1px solid #e5e7eb; text-align: right;">${summary.issuesFound}</td>
                </tr>
                <tr>
                  <td style="border-bottom: 1px solid #e5e7eb;"><strong>Issues Resolved</strong></td>
                  <td style="border-bottom: 1px solid #e5e7eb; text-align: right; color: #059669;">${summary.issuesResolved}</td>
                </tr>
                <tr>
                  <td style="border-bottom: 1px solid #e5e7eb;"><strong>PRs Created</strong></td>
                  <td style="border-bottom: 1px solid #e5e7eb; text-align: right;">${summary.prsCreated}</td>
                </tr>
                <tr>
                  <td><strong>PRs Merged</strong></td>
                  <td style="text-align: right; color: #7c3aed;">${summary.prsMerged}</td>
                </tr>
              </table>
              
              ${highlights.length > 0 ? `
              <h2 style="margin: 24px 0 16px 0; color: #1f2937; font-size: 18px;">✨ Highlights</h2>
              <ul style="margin: 0; padding-left: 20px; color: #374151;">
                ${highlights.map(h => `<li style="margin-bottom: 8px;">${h}</li>`).join('')}
              </ul>
              ` : ''}
              
              ${issues.length > 0 ? `
              <h2 style="margin: 24px 0 16px 0; color: #1f2937; font-size: 18px;">⚠️ Active Issues</h2>
              <table width="100%" cellpadding="8" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px;">
                <tr style="background-color: #f9fafb;">
                  <th style="text-align: left; border-bottom: 1px solid #e5e7eb;">Issue</th>
                  <th style="text-align: center; border-bottom: 1px solid #e5e7eb;">Severity</th>
                  <th style="text-align: center; border-bottom: 1px solid #e5e7eb;">Status</th>
                </tr>
                ${issues.map(i => `
                <tr>
                  <td style="border-bottom: 1px solid #e5e7eb;">${i.title}</td>
                  <td style="border-bottom: 1px solid #e5e7eb; text-align: center;"><span style="background-color: ${getSeverityColor(i.severity as AlertSeverity)}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${i.severity}</span></td>
                  <td style="border-bottom: 1px solid #e5e7eb; text-align: center;">${i.status}</td>
                </tr>
                `).join('')}
              </table>
              ` : ''}
              
              ${nextActions && nextActions.length > 0 ? `
              <h2 style="margin: 24px 0 16px 0; color: #1f2937; font-size: 18px;">🎯 Next Actions</h2>
              <ul style="margin: 0; padding-left: 20px; color: #374151;">
                ${nextActions.map(a => `<li style="margin-bottom: 8px;">${a}</li>`).join('')}
              </ul>
              ` : ''}
              
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                <tr>
                  <td>
                    <a href="https://javari-engineering-os.vercel.app/api/dashboard" style="display: inline-block; background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">View Full Dashboard</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        
        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1f2937; border-radius: 0 0 8px 8px;">
          <tr>
            <td style="padding: 16px 24px; color: #9ca3af; font-size: 12px;">
              <p style="margin: 0;">Javari Engineering OS • CR AudioViz AI, LLC</p>
              <p style="margin: 8px 0 0 0;">Automated ${periodLabel} Report • Your AI Engineering Team</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: ALERT_EMAIL,
      subject: `📊 ${periodLabel} Engineering Digest - ${new Date().toLocaleDateString()}`,
      html,
    });

    if (result.error) {
      console.error('Resend error:', result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Send a test email to verify the system works
 */
export async function sendTestEmail(): Promise<{ success: boolean; error?: string }> {
  return sendAlert({
    title: 'Email Alert System Active',
    message: 'Your Javari Engineering OS email alert system is now configured and working. You will receive alerts for critical issues and daily digests.',
    severity: 'INFO',
    source: 'System Test',
    actionUrl: 'https://javari-engineering-os.vercel.app/api/dashboard',
    actionLabel: 'View Dashboard',
  });
}
