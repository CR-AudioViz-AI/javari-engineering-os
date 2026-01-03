/**
 * JAVARI ENGINEERING OS - VERCEL CLIENT
 * API client for deployments, rollbacks, and project management
 */

import crypto from 'node:crypto';

export interface VercelDeployment {
  uid: string;
  url: string;
  state: string;
  created: number;
  meta?: Record<string, unknown>;
}

export interface VercelProject {
  id: string;
  name: string;
  framework?: string;
  targets?: Record<string, unknown>;
}

export class VercelClient {
  private token: string;
  private baseUrl: string;
  private teamId?: string;

  constructor(opts?: { token?: string; baseUrl?: string; teamId?: string }) {
    this.token = opts?.token ?? process.env.VERCEL_TOKEN ?? '';
    this.baseUrl = opts?.baseUrl ?? 'https://api.vercel.com';
    this.teamId = opts?.teamId ?? process.env.VERCEL_TEAM_ID;
    if (!this.token) throw new Error('Missing VERCEL_TOKEN');
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const separator = path.includes('?') ? '&' : '?';
    const teamParam = this.teamId ? `${separator}teamId=${this.teamId}` : '';
    
    const res = await fetch(`${this.baseUrl}${path}${teamParam}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'User-Agent': `javari-engineering-os/${crypto.randomUUID().slice(0, 8)}`,
        ...(init?.headers || {}),
      },
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Vercel API ${res.status} ${path}: ${text}`);
    }
    
    return JSON.parse(text) as T;
  }

  async getProject(projectId: string): Promise<VercelProject> {
    return this.req<VercelProject>(`/v9/projects/${projectId}`);
  }

  async listProjects(limit = 100): Promise<{ projects: VercelProject[] }> {
    return this.req<{ projects: VercelProject[] }>(`/v9/projects?limit=${limit}`);
  }

  async listDeployments(projectId: string, limit = 10): Promise<VercelDeployment[]> {
    const data = await this.req<{ deployments: VercelDeployment[] }>(
      `/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=${limit}`
    );
    return data.deployments || [];
  }

  async getDeployment(deploymentId: string): Promise<VercelDeployment> {
    return this.req<VercelDeployment>(`/v13/deployments/${deploymentId}`);
  }

  async redeploy(deploymentId: string): Promise<unknown> {
    return this.req<unknown>(`/v13/deployments/${deploymentId}/redeploy`, { 
      method: 'POST' 
    });
  }

  async rollback(projectId: string, deploymentId: string): Promise<unknown> {
    // Promote a previous deployment to production
    return this.req<unknown>(`/v13/deployments/${deploymentId}/promote`, {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    });
  }

  async cancelDeployment(deploymentId: string): Promise<unknown> {
    return this.req<unknown>(`/v12/deployments/${deploymentId}/cancel`, {
      method: 'PATCH',
    });
  }
}
