import { NextResponse } from 'next/server';
import { sendAlert, sendDigest, sendTestEmail } from '@/lib/email-alerts';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export const dynamic = 'force-dynamic';

/**
 * POST /api/alerts/email
 * Send email alerts
 * 
 * Body:
 * - type: 'alert' | 'digest' | 'test'
 * - payload: AlertPayload | DigestPayload
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, payload } = body;

    let result;

    switch (type) {
      case 'test':
        result = await sendTestEmail();
        break;
      
      case 'alert':
        if (!payload?.title || !payload?.message || !payload?.severity) {
          return NextResponse.json({
            error: 'Missing required fields: title, message, severity',
          }, { status: 400 });
        }
        result = await sendAlert(payload);
        break;
      
      case 'digest':
        if (!payload?.period || !payload?.summary) {
          return NextResponse.json({
            error: 'Missing required fields: period, summary',
          }, { status: 400 });
        }
        result = await sendDigest(payload);
        break;
      
      default:
        return NextResponse.json({
          error: 'Invalid type. Use: test, alert, or digest',
        }, { status: 400 });
    }

    // Log the alert
    await supabase.from('alert_log').insert({
      type,
      payload,
      success: result.success,
      error: result.error,
      sent_at: new Date().toISOString(),
    }).catch(() => {}); // Don't fail if logging fails

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

/**
 * GET /api/alerts/email
 * Get alert configuration and status
 */
export async function GET() {
  const alertEmail = process.env.ALERT_EMAIL || 'royhenderson@craudiovizai.com';
  const resendConfigured = !!process.env.RESEND_API_KEY;

  return NextResponse.json({
    status: resendConfigured ? 'configured' : 'missing_api_key',
    alert_email: alertEmail,
    from_email: 'alerts@craudiovizai.com',
    capabilities: [
      'Critical alerts (immediate)',
      'High severity alerts (immediate)',
      'Daily digest (6 AM EST)',
      'Weekly digest (Monday 6 AM EST)',
      'Audit reports',
      'PR notifications',
    ],
    endpoints: {
      send_test: 'POST /api/alerts/email { type: "test" }',
      send_alert: 'POST /api/alerts/email { type: "alert", payload: { title, message, severity, ... } }',
      send_digest: 'POST /api/alerts/email { type: "digest", payload: { period, summary, ... } }',
    },
  });
}
