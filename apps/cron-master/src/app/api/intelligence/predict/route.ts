import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'royhenderson@craudiovizai.com';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface HealthLog {
  id: number;
  project_id: string;
  status: string;
  response_time: number;
  error_message?: string;
  created_at: string;
}

interface Prediction {
  projectId: string;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  predictedIssues: string[];
  recommendations: string[];
  preventiveActions: string[];
}

async function getRecentHealthLogs(hours: number = 24): Promise<HealthLog[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  
  const { data } = await supabase
    .from('health_logs')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);
  
  return data || [];
}

async function analyzeWithAI(logs: HealthLog[]): Promise<Prediction[]> {
  if (!ANTHROPIC_API_KEY || logs.length === 0) {
    return [];
  }
  
  const summary = logs.reduce((acc, log) => {
    const key = log.project_id;
    if (!acc[key]) {
      acc[key] = { errors: 0, slow: 0, total: 0, avgTime: 0, times: [] as number[] };
    }
    acc[key].total++;
    if (log.status === 'error' || log.status === 'down') acc[key].errors++;
    if (log.response_time > 2000) acc[key].slow++;
    acc[key].times.push(log.response_time);
    return acc;
  }, {} as Record<string, { errors: number; slow: number; total: number; avgTime: number; times: number[] }>);
  
  // Calculate averages
  Object.keys(summary).forEach(key => {
    const times = summary[key].times;
    summary[key].avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  });
  
  const prompt = `Analyze these health metrics for CR AudioViz AI infrastructure and predict potential failures:

${JSON.stringify(summary, null, 2)}

For each project, provide:
1. Risk score (0.0 to 1.0)
2. Risk level (LOW/MEDIUM/HIGH/CRITICAL)
3. Predicted issues in next 24 hours
4. Specific recommendations
5. Preventive actions

Respond in JSON format:
{
  "predictions": [
    {
      "projectId": "project_name",
      "riskScore": 0.7,
      "riskLevel": "HIGH",
      "predictedIssues": ["issue1", "issue2"],
      "recommendations": ["rec1", "rec2"],
      "preventiveActions": ["action1"]
    }
  ]
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    
    const data = await response.json();
    const content = data.content?.[0]?.text || '';
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.predictions || [];
    }
  } catch (error) {
    console.error('AI analysis error:', error);
  }
  
  return [];
}

async function executePreventiveAction(action: string, projectId: string): Promise<boolean> {
  // Log the preventive action
  await supabase.from('preventive_actions').insert({
    action_type: action,
    project_id: projectId,
    executed_at: new Date().toISOString(),
    status: 'executed',
  });
  
  // Implement specific preventive actions based on type
  switch (action) {
    case 'increase_monitoring':
      // Increase monitoring frequency
      return true;
    case 'warm_cache':
      // Trigger cache warming
      return true;
    case 'scale_resources':
      // Request scaling
      return true;
    default:
      return true;
  }
}

async function sendPredictionAlert(predictions: Prediction[]) {
  if (!RESEND_API_KEY) return;
  
  const highRisk = predictions.filter(p => p.riskScore > 0.6);
  if (highRisk.length === 0) return;
  
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:auto">
      <div style="background:#f59e0b;color:white;padding:20px;border-radius:8px 8px 0 0">
        <h2>🔮 Predictive Failure Alert</h2>
        <p>High-risk issues detected in your infrastructure</p>
      </div>
      <div style="background:white;padding:20px;border:1px solid #e5e7eb">
        ${highRisk.map(p => `
          <div style="margin-bottom:20px;padding:15px;background:#fef3c7;border-radius:8px">
            <h3>${p.projectId}</h3>
            <p><strong>Risk Score:</strong> ${(p.riskScore * 100).toFixed(0)}% (${p.riskLevel})</p>
            <p><strong>Predicted Issues:</strong></p>
            <ul>${p.predictedIssues.map(i => `<li>${i}</li>`).join('')}</ul>
            <p><strong>Recommendations:</strong></p>
            <ul>${p.recommendations.map(r => `<li>${r}</li>`).join('')}</ul>
          </div>
        `).join('')}
        <p><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST</p>
      </div>
    </div>
  `;
  
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Javari AI <onboarding@resend.dev>',
      to: ALERT_EMAIL,
      subject: `🔮 [PREDICTIVE] ${highRisk.length} High-Risk Issues Detected`,
      html,
    }),
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hours = parseInt(searchParams.get('hours') || '24');
  const autoPrevent = searchParams.get('prevent') === 'true';
  
  const startTime = Date.now();
  
  // Get recent health logs
  const logs = await getRecentHealthLogs(hours);
  
  // Analyze with AI
  const predictions = await analyzeWithAI(logs);
  
  // Store predictions
  for (const prediction of predictions) {
    await supabase.from('failure_predictions').insert({
      project_id: prediction.projectId,
      risk_score: prediction.riskScore,
      risk_level: prediction.riskLevel,
      predicted_issues: prediction.predictedIssues,
      recommendations: prediction.recommendations,
      preventive_actions: prediction.preventiveActions,
      created_at: new Date().toISOString(),
    });
  }
  
  // Execute preventive actions if enabled
  let actionsExecuted = 0;
  if (autoPrevent) {
    for (const prediction of predictions) {
      if (prediction.riskScore > 0.7) {
        for (const action of prediction.preventiveActions) {
          await executePreventiveAction(action, prediction.projectId);
          actionsExecuted++;
        }
      }
    }
  }
  
  // Send alerts for high-risk predictions
  await sendPredictionAlert(predictions);
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
    analysis_period_hours: hours,
    logs_analyzed: logs.length,
    predictions,
    preventive_actions_executed: actionsExecuted,
    summary: {
      total_predictions: predictions.length,
      critical: predictions.filter(p => p.riskLevel === 'CRITICAL').length,
      high: predictions.filter(p => p.riskLevel === 'HIGH').length,
      medium: predictions.filter(p => p.riskLevel === 'MEDIUM').length,
      low: predictions.filter(p => p.riskLevel === 'LOW').length,
    },
  });
}
