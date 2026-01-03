import { NextResponse } from 'next/server';
import { 
  sendAlert, 
  sendCriticalAlert, 
  sendDailySummary,
  type AlertSeverity 
} from '@/lib/email';

export const dynamic = 'force-dynamic';

// POST /api/notify - Send notifications
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, severity, title, message, details } = body;

    if (!type || !title || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: type, title, message' },
        { status: 400 }
      );
    }

    const result = await sendAlert({
      type,
      severity: (severity as AlertSeverity) || 'HIGH',
      title,
      message,
      details,
    });

    return NextResponse.json({
      success: result.success,
      emailId: result.id,
      error: result.error,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// GET /api/notify - Test endpoint / status
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const test = searchParams.get('test');

  // If test=true, send a test email
  if (test === 'true') {
    const result = await sendCriticalAlert(
      'Test Alert',
      'This is a test alert from Javari Engineering OS to verify email notifications are working.',
      { test: true, timestamp: new Date().toISOString() }
    );

    return NextResponse.json({
      test: true,
      result,
      timestamp: new Date().toISOString(),
    });
  }

  // Otherwise return status
  return NextResponse.json({
    status: 'ready',
    configured: !!process.env.RESEND_API_KEY,
    alertEmail: process.env.ALERT_EMAIL || 'not set',
    timestamp: new Date().toISOString(),
    usage: {
      testEmail: 'GET /api/notify?test=true',
      sendAlert: 'POST /api/notify with { type, severity, title, message, details }',
    },
    severityLevels: {
      CRITICAL: 'Sends email immediately',
      HIGH: 'Sends email immediately',
      MEDIUM: 'Logged only (no email)',
      LOW: 'Logged only (no email)',
    },
  });
}
