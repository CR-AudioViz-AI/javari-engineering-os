/**
 * JAVARI ENGINEERING OS - SELF-HEAL PLAYBOOKS
 * Automated remediation for common issues
 * 
 * Javari learns from every incident and builds smarter playbooks over time
 */

// ==========================================================================
// TYPES
// ==========================================================================

export type HealActionType = 
  | 'RESTART'
  | 'REDEPLOY'
  | 'ROLLBACK'
  | 'CACHE_PURGE'
  | 'FEATURE_FLAG_TOGGLE'
  | 'QUARANTINE'
  | 'NOTIFY'
  | 'LEARN';

export type TargetType = 'domain' | 'project' | 'endpoint' | 'flag' | 'db';

export interface HealAction {
  actionType: HealActionType;
  targetType: TargetType;
  targetId: string;
  reason: string;
  safety: {
    requiresApproval: boolean;
    maxAttempts: number;
    cooldownSeconds: number;
  };
  verify: {
    type: 'http' | 'api_contract' | 'db_query' | 'custom';
    url?: string;
    expectedStatus?: number;
    retries: number;
    backoffMs: number;
  };
}

export interface Playbook {
  id: string;
  name: string;
  description: string;
  match: {
    statusCode?: number;
    endpointContains?: string;
    pageContains?: string;
    issueCategory?: string;
    errorContains?: string;
  };
  actions: HealAction[];
  learnedAt?: string;
  successRate?: number;
}

// ==========================================================================
// DEFAULT PLAYBOOKS
// ==========================================================================

export const defaultPlaybooks: Playbook[] = [
  {
    id: 'pb_503_dynamic_pages',
    name: '503 on Dynamic Pages',
    description: 'Handle 503 errors on dynamic pages like /apps, /dashboard',
    match: { 
      statusCode: 503, 
      pageContains: '/apps' 
    },
    actions: [
      {
        actionType: 'CACHE_PURGE',
        targetType: 'domain',
        targetId: 'craudiovizai.com',
        reason: 'Clear CDN cache to ensure fresh content',
        safety: { requiresApproval: false, maxAttempts: 1, cooldownSeconds: 60 },
        verify: { type: 'http', url: 'https://craudiovizai.com/apps', expectedStatus: 200, retries: 3, backoffMs: 5000 }
      },
      {
        actionType: 'RESTART',
        targetType: 'project',
        targetId: 'javari-ai',
        reason: '503 on critical dynamic page; restart project runtime',
        safety: { requiresApproval: false, maxAttempts: 2, cooldownSeconds: 120 },
        verify: { type: 'http', url: 'https://craudiovizai.com/apps', expectedStatus: 200, retries: 5, backoffMs: 5000 }
      },
      {
        actionType: 'REDEPLOY',
        targetType: 'project',
        targetId: 'javari-ai',
        reason: 'If restart failed, redeploy latest stable',
        safety: { requiresApproval: true, maxAttempts: 1, cooldownSeconds: 600 },
        verify: { type: 'http', url: 'https://craudiovizai.com/apps', expectedStatus: 200, retries: 10, backoffMs: 8000 }
      }
    ]
  },
  {
    id: 'pb_api_500',
    name: 'API 500 Errors',
    description: 'Handle internal server errors on API endpoints',
    match: { 
      statusCode: 500, 
      endpointContains: '/api/' 
    },
    actions: [
      {
        actionType: 'FEATURE_FLAG_TOGGLE',
        targetType: 'flag',
        targetId: 'API_SAFE_MODE',
        reason: 'Enable safe mode to return minimal responses while investigating',
        safety: { requiresApproval: false, maxAttempts: 1, cooldownSeconds: 60 },
        verify: { type: 'http', retries: 3, backoffMs: 3000 }
      },
      {
        actionType: 'NOTIFY',
        targetType: 'domain',
        targetId: 'engineering',
        reason: 'Alert engineering team about API failures',
        safety: { requiresApproval: false, maxAttempts: 1, cooldownSeconds: 300 },
        verify: { type: 'custom', retries: 1, backoffMs: 0 }
      },
      {
        actionType: 'LEARN',
        targetType: 'db',
        targetId: 'knowledge_base',
        reason: 'Record incident for continuous learning',
        safety: { requiresApproval: false, maxAttempts: 1, cooldownSeconds: 0 },
        verify: { type: 'custom', retries: 1, backoffMs: 0 }
      }
    ]
  },
  {
    id: 'pb_db_connection',
    name: 'Database Connection Issues',
    description: 'Handle Supabase connection failures',
    match: { 
      errorContains: 'SUPABASE' 
    },
    actions: [
      {
        actionType: 'CACHE_PURGE',
        targetType: 'project',
        targetId: 'all',
        reason: 'Clear connection pools and caches',
        safety: { requiresApproval: false, maxAttempts: 1, cooldownSeconds: 30 },
        verify: { type: 'db_query', retries: 5, backoffMs: 2000 }
      },
      {
        actionType: 'NOTIFY',
        targetType: 'domain',
        targetId: 'engineering',
        reason: 'Database connectivity issues require immediate attention',
        safety: { requiresApproval: false, maxAttempts: 1, cooldownSeconds: 60 },
        verify: { type: 'custom', retries: 1, backoffMs: 0 }
      }
    ]
  },
  {
    id: 'pb_high_latency',
    name: 'High Latency Response',
    description: 'Handle endpoints with response time > 5 seconds',
    match: { 
      issueCategory: 'PERF' 
    },
    actions: [
      {
        actionType: 'CACHE_PURGE',
        targetType: 'domain',
        targetId: 'craudiovizai.com',
        reason: 'Purge cache to potentially resolve stale data issues',
        safety: { requiresApproval: false, maxAttempts: 1, cooldownSeconds: 300 },
        verify: { type: 'http', retries: 3, backoffMs: 3000 }
      },
      {
        actionType: 'LEARN',
        targetType: 'db',
        targetId: 'knowledge_base',
        reason: 'Record latency pattern for analysis',
        safety: { requiresApproval: false, maxAttempts: 1, cooldownSeconds: 0 },
        verify: { type: 'custom', retries: 1, backoffMs: 0 }
      }
    ]
  },
  {
    id: 'pb_cron_limit',
    name: 'Cron Job Limit Reached',
    description: 'Handle Vercel cron saturation (40/40)',
    match: { 
      errorContains: 'cron_jobs_limits_reached' 
    },
    actions: [
      {
        actionType: 'FEATURE_FLAG_TOGGLE',
        targetType: 'flag',
        targetId: 'DISABLE_NONCRITICAL_CRONS',
        reason: 'Disable non-critical crons to free up slots',
        safety: { requiresApproval: true, maxAttempts: 1, cooldownSeconds: 3600 },
        verify: { type: 'custom', retries: 1, backoffMs: 0 }
      },
      {
        actionType: 'NOTIFY',
        targetType: 'domain',
        targetId: 'engineering',
        reason: 'Cron consolidation needed - migrate to master orchestrator',
        safety: { requiresApproval: false, maxAttempts: 1, cooldownSeconds: 300 },
        verify: { type: 'custom', retries: 1, backoffMs: 0 }
      }
    ]
  }
];

// ==========================================================================
// PLAYBOOK MATCHING
// ==========================================================================

export interface Incident {
  fingerprint: string;
  category: string;
  statusCode?: number;
  url?: string;
  title: string;
  errorMessage?: string;
  details?: Record<string, unknown>;
}

export function findMatchingPlaybooks(incident: Incident): Playbook[] {
  return defaultPlaybooks.filter((pb) => {
    // Status code match
    if (pb.match.statusCode && incident.statusCode !== pb.match.statusCode) {
      return false;
    }

    // Endpoint pattern match
    if (pb.match.endpointContains && !(incident.url || '').includes(pb.match.endpointContains)) {
      return false;
    }

    // Page pattern match
    if (pb.match.pageContains && !(incident.url || '').includes(pb.match.pageContains)) {
      return false;
    }

    // Category match
    if (pb.match.issueCategory && pb.match.issueCategory !== incident.category) {
      return false;
    }

    // Error message match
    if (pb.match.errorContains && !(incident.errorMessage || '').includes(pb.match.errorContains)) {
      return false;
    }

    return true;
  });
}

// ==========================================================================
// EXPORTS
// ==========================================================================

export { HealActionType as ActionType, TargetType };
