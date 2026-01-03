import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

export const dynamic = 'force-dynamic';

const ALERT_EMAIL = process.env.ALERT_EMAIL || 'royhenderson@craudiovizai.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY;

interface AlertPayload {
  title: string;
  message: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  source?: string;
  details?: Record<string, unknown>;
}

async function sendEmail(payload: AlertPayload): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  const colors: Record<string, string> = {
    CRITICAL: '#dc2626',
    HIGH: '#ea580c',
    MEDIUM: '#ca8a04',
    LOW: '#2563eb',
    INFO: '#059669',
  };

  const emojis: Record<string, string> = {
    CRITICAL: '🚨',
    HIGH: '⚠️',
    MEDIUM: '📢',
    LOW: '📝',
    INFO: 'ℹ️',
  };

  const color = colors[payload.severity] || '#6b7280';
  const emoji = emojis[payload.severity] || '📌';
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
      <div style="background: ${color}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0;">${emoji} ${payload.severity} ALERT</h1>
        <p style="margin: 8px 0 0;">${payload.title}</p>
      </div>
      <div style="background: white; padding: 20px; border: 1px solid #e5e7eb;">
        <p><strong>Time:</strong> ${timestamp} EST</p>
        ${payload.source ? `<p><strong>Source:</strong> ${payload.source}</p>` : ''}
        <div style="background: #f9fafb; border-left: 4px solid ${color}; padding: 16px; margin: 16px 0;">
          ${payload.message}
        </div>
        ${payload.details ? `<pre style="background: #1f2937; color: #e5e7eb; padding: 16px; border-radius: 6px; font-size: 12px; overflow: auto;">${JSON.stringify(payload.details, null, 2)}</pre>` : ''}
      </div>
      <div style="background: #1f2937; color: #9ca3af; padding: 16px; font-size: 12px; border-radius: 0 0 8px 8px;">
        Javari Engineering OS • CR AudioViz AI
      </div>
    </div>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Javari AI <onboarding@resend.dev>',
        to: ALERT_EMAIL,
        subject: `${emoji} [${payload.severity}] ${payload.title}`,
        html,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || 'Email send failed' };
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

    if (type === 'test') {
      const result = await sendEmail({
        title: 'Email Alert System Active',
        message: 'Your Javari Engineering OS email alert system is now configured and working. You will receive alerts for critical issues.',
        severity: 'INFO',
        source: 'System Test',
      });

      return NextResponse.json({
        success: result.success,
        error: result.error,
        timestamp: new Date().toISOString(),
      });
    }

    if (type === 'alert') {
      if (!payload?.title || !payload?.message || !payload?.severity) {
        return NextResponse.json({ error: 'Missing required fields: title, message, severity' }, { status: 400 });
      }

      const result = await sendEmail(payload);

      // Log to database
      await supabase.from('alert_log').insert({
        alert_type: payload.severity,
        title: payload.title,
        message: payload.message,
        source: payload.source,
        success: result.success,
        error_message: result.error,
        created_at: new Date().toISOString(),
      }).catch(() => {});

      return NextResponse.json({
        success: result.success,
        error: result.error,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: 'Invalid type. Use: test or alert' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: RESEND_API_KEY ? 'configured' : 'missing_api_key',
    alert_email: ALERT_EMAIL,
    usage: {
      test: 'POST { "type": "test" }',
      alert: 'POST { "type": "alert", "payload": { "title": "...", "message": "...", "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO" } }',
    },
  });
}
