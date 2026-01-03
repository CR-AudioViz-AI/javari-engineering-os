import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '';
const TEAM_ID = process.env.VERCEL_TEAM_ID || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'royhenderson@craudiovizai.com';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Project {
  id: string;
  name: string;
  url: string;
  critical: boolean;
  lastGoodDeployment?: string;
}

const MONITORED_PROJECTS: Project[] = [
  { id: 'prj_BF1scLPAvLjCcSiuTIf1X8Jnlny1', name: 'javari-engineering-os', url: 'javari-engineering-os.vercel.app', critical: true },
  { id: 'prj_zxjzE2qvMWFWqV0AspGvago6aPV5', name: 'javari-ai', url: 'crav-javari.vercel.app', critical: true },
  { id: 'prj_E9h9cIDfmEzwOcjICKAlns8ElyqK', name: 'javari-market', url: 'javari-market.vercel.app', critical: false },
  { id: 'prj_217IrUa6BOPJDYxayvxf9LNY2E2G', name: 'cravbarrels', url: 'cravbarrels.vercel.app', critical: false },
];

async function checkSiteHealth(url: string): Promise<{ status: number; responseTime: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(`https://${url}`, {
      method: 'HEAD',
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    return { status: response.status, responseTime: Date.now() - start };
  } catch {
    return { status: 0, responseTime: Date.now() - start };
  }
}

async function getLastSuccessfulDeployment(projectId: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&teamId=${TEAM_ID}&state=READY&limit=1`,
      { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
    );
    
    const data = await response.json();
    return data.deployments?.[0]?.uid || null;
  } catch {
    return null;
  }
}

async function triggerRedeployment(project: Project): Promise<{ success: boolean; deploymentId?: string; error?: string }> {
  try {
    const response = await fetch(
      `https://api.vercel.com/v13/deployments?teamId=${TEAM_ID}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: project.name,
          project: project.id,
          target: 'production',
          gitSource: {
            type: 'github',
            org: 'CR-AudioViz-AI',
            repo: project.name,
            ref: 'main',
          },
        }),
      }
    );
    
    const data = await response.json();
    
    if (data.id) {
      return { success: true, deploymentId: data.id };
    }
    
    return { success: false, error: data.error?.message || 'Unknown error' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function sendHealingAlert(action: string, project: string, success: boolean, details: string) {
  if (!RESEND_API_KEY) return;
  
  const emoji = success ? '🩹' : '🚨';
  const color = success ? '#059669' : '#dc2626';
  
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Javari AI <onboarding@resend.dev>',
      to: ALERT_EMAIL,
      subject: `${emoji} [SELF-HEALING] ${action} - ${project}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:auto"><div style="background:${color};color:white;padding:20px;border-radius:8px 8px 0 0"><h2>${emoji} Self-Healing Action</h2></div><div style="background:white;padding:20px;border:1px solid #e5e7eb"><p><strong>Action:</strong> ${action}</p><p><strong>Project:</strong> ${project}</p><p><strong>Result:</strong> ${success ? 'Success' : 'Failed'}</p><p><strong>Details:</strong> ${details}</p><p><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST</p></div></div>`,
    }),
  });
}

async function logHealingAction(action: string, projectId: string, success: boolean, details: Record<string, unknown>) {
  await supabase.from('healing_actions').insert({
    action_type: action,
    project_id: projectId,
    success,
    details,
    created_at: new Date().toISOString(),
  });
}

export async function GET() {
  const startTime = Date.now();
  const results: Array<{
    project: string;
    status: string;
    action?: string;
    deploymentId?: string;
  }> = [];
  
  let healingActionsPerformed = 0;
  
  for (const project of MONITORED_PROJECTS) {
    const health = await checkSiteHealth(project.url);
    
    if (health.status === 503 || health.status === 500 || health.status === 0) {
      // Site is down - attempt auto-healing
      console.log(`[HEALING] ${project.name} is down (HTTP ${health.status}), attempting redeployment...`);
      
      const redeployResult = await triggerRedeployment(project);
      
      if (redeployResult.success) {
        healingActionsPerformed++;
        
        await logHealingAction('auto_redeploy', project.id, true, {
          reason: `HTTP ${health.status}`,
          deploymentId: redeployResult.deploymentId,
        });
        
        await sendHealingAlert(
          'Auto-Redeployment',
          project.name,
          true,
          `Triggered new deployment (${redeployResult.deploymentId}) due to HTTP ${health.status}`
        );
        
        results.push({
          project: project.name,
          status: 'healing',
          action: 'auto_redeploy',
          deploymentId: redeployResult.deploymentId,
        });
      } else {
        await logHealingAction('auto_redeploy', project.id, false, {
          reason: `HTTP ${health.status}`,
          error: redeployResult.error,
        });
        
        if (project.critical) {
          await sendHealingAlert(
            'Auto-Redeployment FAILED',
            project.name,
            false,
            `Failed to redeploy: ${redeployResult.error}. Manual intervention required.`
          );
        }
        
        results.push({
          project: project.name,
          status: 'failed',
          action: 'escalated',
        });
      }
    } else if (health.status === 200) {
      results.push({
        project: project.name,
        status: 'healthy',
      });
    } else {
      results.push({
        project: project.name,
        status: `warning_${health.status}`,
      });
    }
  }
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
    healing_actions: healingActionsPerformed,
    projects: results,
    capabilities: {
      auto_redeploy: true,
      escalation_alerts: true,
      healing_logs: true,
    },
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { projectId, action } = body;
  
  if (action === 'force_redeploy') {
    const project = MONITORED_PROJECTS.find(p => p.id === projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    
    const result = await triggerRedeployment(project);
    
    await logHealingAction('manual_redeploy', projectId, result.success, {
      reason: 'manual_trigger',
      deploymentId: result.deploymentId,
    });
    
    return NextResponse.json(result);
  }
  
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
