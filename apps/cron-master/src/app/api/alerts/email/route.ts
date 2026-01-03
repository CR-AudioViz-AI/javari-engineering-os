import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export const dynamic = 'force-dynamic';

const ALERT_EMAIL = process.env.ALERT_EMAIL || 'royhenderson@craudiovizai.com';
const FROM_EMAIL = 'Javari AI <alerts@craudiovizai.com>';

type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

function getSeverityColor(severity: AlertSeverity): string {
  const colors: Record<AlertSeverity, string> = {
    CRITICAL: '#dc2626',
    HIGH: '#ea580c',
    MEDIUM: '#ca8a04',
    LOW: '#2563eb',
    INFO: '#059669',
  };
  return colors[severity] || '#6b7280';
}

function getSeverityEmoji(severity: AlertSeverity): string {
  const emojis: Record<AlertSeverity, string> = {
    CRITICAL: '🚨',
    HIGH: '⚠️',
    MEDIUM: '📢',
    LOW: '📝',
    INFO: 'ℹ️',
  };
  return emojis[severity] || '📌';
}

async function sendAlertEmail(payload: {
  title: string;
  message: string;
  severity: AlertSeverity;
  source?: string;
  details?: Record<string, unknown>;
  actionUrl?: string;
  actionLabel?: string;
}) {
  const { title, message, severity, source, details, actionUrl, actionLabel } = payload;
  const color = getSeverityColor(severity);
  const emoji = getSeverityEmoji(severity);
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${emoji} ${severity} Alert</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6;">
  <table width="100%" style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <tr>
      <td>
        <table width="100%" style="background-color: ${color}; border-radius: 8px 8px 0 0;">
          <tr>
            <td style="padding: 24px; color: white;">
              <h1 style="margin: 0; font-size: 24px;">${emoji} ${severity} ALERT</h1>
              <p style="margin: 8px 0 0 0; opacity: 0.9;">${title}</p>
            </td>
          </tr>
        </table>
        <table width="100%" style="background-color: white; border: 1px solid #e5e7eb; border-top: none;">
          <tr>
            <td style="padding: 24px;">
              <p><strong>Time:</strong> ${timestamp} EST</p>
              ${source ? `<p><strong>Source:</strong> ${source}</p>` : ''}
              <div style="background-color: #f9fafb; border-left: 4px solid ${color}; padding: 16px; margin: 16px 0;">
                <p style="margin: 0;">${message}</p>
              </div>
              ${details ? `<pre style="background-color: #1f2937; color: #e5e7eb; padding: 16px; border-radius: 6px; font-size: 12px;">${JSON.stringify(details, null, 2)}</pre>` : ''}
              ${actionUrl ? `<p><a href="${actionUrl}" style="display: inline-block; background-color: ${color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">${actionLabel || 'View Details'}</a></p>` : ''}
            </td>
          </tr>
        </table>
        <table width="100%" style="background-color: #1f2937; border-radius: 0 0 8px 8px;">
          <tr>
            <td style="padding: 16px 24px; color: #9ca3af; font-size: 12px;">
              <p style="margin: 0;">Javari Engineering OS • CR AudioViz AI, LLC</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: ALERT_EMAIL,
      subject: `${emoji} [${severity}] ${title}`,
      html,
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, payload } = body;

    let result;

    if (type === 'test') {
      result = await sendAlertEmail({
        title: 'Email Alert System Active',
        message: 'Your Javari Engineering OS email alert system is now configured and working.',
        severity: 'INFO',
        source: 'System Test',
        actionUrl: 'https://javari-engineering-os.vercel.app/api/dashboard',
        actionLabel: 'View Dashboard',
      });
    } else if (type === 'alert') {
      if (!payload?.title || !payload?.message || !payload?.severity) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      result = await sendAlertEmail(payload);
    } else {
      return NextResponse.json({ error: 'Invalid type. Use: test or alert' }, { status: 400 });
    }

    await supabase.from('alert_log').insert({
      type,
      payload,
      success: result.success,
      error: result.error,
      sent_at: new Date().toISOString(),
    }).catch(() => {});

    return NextResponse.json({
      success: result.success,
      error: result.error,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: process.env.RESEND_API_KEY ? 'configured' : 'missing_api_key',
    alert_email: ALERT_EMAIL,
    from_email: FROM_EMAIL,
    endpoints: {
      send_test: 'POST /api/alerts/email { type: "test" }',
      send_alert: 'POST /api/alerts/email { type: "alert", payload: { title, message, severity, ... } }',
    },
  });
}
