/**
 * JAVARI ENGINEERING OS - WORKITEM SCHEMA
 * Canonical schema for audit → workqueue → builder automation
 */

import { z } from 'zod';

export const SeveritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);
export type Severity = z.infer<typeof SeveritySchema>;

export const CategorySchema = z.enum([
  'OPS', 'SECURITY', 'API', 'SEO', 'A11Y', 'PERF',
  'UX', 'DATA', 'PAYMENTS', 'AUTH', 'COST', 'LEARNING', 'OTHER'
]);
export type Category = z.infer<typeof CategorySchema>;

export const StatusSchema = z.enum([
  'NEW', 'DISPATCHED', 'IN_PROGRESS', 'PR_OPENED', 'VERIFIED',
  'MERGED', 'DEPLOYED', 'BLOCKED', 'FAILED', 'SUPPRESSED'
]);
export type Status = z.infer<typeof StatusSchema>;

export const WorkItemSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid().optional(),
  fingerprint: z.string().min(16),

  title: z.string().min(5),
  description: z.string().min(10),

  severity: SeveritySchema,
  category: CategorySchema,
  status: StatusSchema.optional(),

  domain: z.string().optional(),
  repo: z.string().optional(),
  vercel_project_id: z.string().optional(),
  route_or_endpoint: z.string().optional(),

  recommended_fix: z.string().optional(),

  acceptance_criteria: z.array(z.string().min(3)).min(1),
  verification_plan: z.array(z.string().min(3)).min(1),
  rollback_plan: z.array(z.string().min(3)).min(1),

  evidence_urls: z.array(z.string()).default([]),

  created_by: z.string().default('auditops'),
  assigned_model: z.enum(['claude', 'openai', 'local']).default('claude'),
  requires_approval: z.boolean().default(true),

  tags: z.array(z.string()).default([]),
  priority_score: z.number().int().min(1).max(100).default(50),

  source: z.object({
    audit_run_id: z.string().uuid().optional(),
    audit_issue_fingerprint: z.string().optional(),
    audit_issue_id: z.string().optional(),
  }).default({})
});

export type WorkItem = z.infer<typeof WorkItemSchema>;
