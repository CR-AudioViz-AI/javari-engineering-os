/**
 * JAVARI ENGINEERING OS - ALERTS
 * Slack, webhook, and notification helpers
 */

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface AlertPayload {
  severity: AlertSeverity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export async function sendSlackAlert(payload: AlertPayload): Promise<boolean> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    console.log(`[ALERT:${payload.severity}] ${payload.title}: ${payload.message}`);
    return false;
  }

  const emoji = {
    CRITICAL: '🔴',
    HIGH: '🟠',
    MEDIUM: '🟡',
    LOW: '🟢',
    INFO: 'ℹ️',
  }[payload.severity];

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${emoji} *[${payload.severity}] ${payload.title}*\n${payload.message}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${emoji} *[${payload.severity}] ${payload.title}*\n${payload.message}`,
            },
          },
        ],
      }),
    });

    return res.ok;
  } catch (err) {
    console.error('Slack alert failed:', err);
    return false;
  }
}

export async function sendWebhookAlert(webhookUrl: string, payload: AlertPayload): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        timestamp: new Date().toISOString(),
      }),
    });

    return res.ok;
  } catch (err) {
    console.error('Webhook alert failed:', err);
    return false;
  }
}
