/**
 * JAVARI ENGINEERING OS - BUILDER PROMPT TEMPLATE
 * Produces deterministic, high-quality Claude patch prompts
 */

import type { WorkItem } from './workItemSchema';

export function buildClaudePrompt(item: WorkItem): string {
  const ac = item.acceptance_criteria.map((x, i) => `${i + 1}. ${x}`).join('\n');
  const vp = item.verification_plan.map((x, i) => `${i + 1}. ${x}`).join('\n');
  const rb = item.rollback_plan.map((x, i) => `${i + 1}. ${x}`).join('\n');
  const ev = (item.evidence_urls || []).length 
    ? item.evidence_urls.map((u) => `- ${u}`).join('\n') 
    : '- (none)';

  return `
You are Claude acting as a Staff+ Platform Engineer. Implement the WorkItem below as production-ready code.

RULES (non-negotiable):
- Output FULL-FILE replacements only. No patches or diffs.
- Implement tests (unit + integration) where relevant.
- Include verification scripts/commands and rollback steps.
- Do NOT change unrelated code.
- Security: no secrets in output; do not log tokens; sanitize artifacts.
- Performance: avoid unnecessary heavy dependencies.
- Accessibility: WCAG 2.2 AA wherever UI changes occur.
- If you need to modify multiple repos, output changes repo-by-repo.

WORK ITEM:
Title: ${item.title}
Severity: ${item.severity}
Category: ${item.category}
Domain: ${item.domain || '(n/a)'}
Repo: ${item.repo || '(n/a)'}
Route/Endpoint: ${item.route_or_endpoint || '(n/a)'}
Fingerprint: ${item.fingerprint}

DESCRIPTION:
${item.description}

RECOMMENDED FIX:
${item.recommended_fix || '(not provided)'}

EVIDENCE:
${ev}

ACCEPTANCE CRITERIA:
${ac}

VERIFICATION PLAN:
${vp}

ROLLBACK PLAN:
${rb}

OUTPUT FORMAT:
1) Brief plan (2-3 sentences)
2) Full-file code replacements (include file paths as comments)
3) Tests + scripts
4) Verification steps (commands to run)
5) Rollback steps (if something goes wrong)

Begin now.
`.trim();
}

export function buildReviewerPrompt(prUrl: string, diffText: string, ciSummary: string): string {
  return `
You are the "Architect Reviewer" for Javari Engineering OS.
Review the PR diff and CI summary. Return JSON ONLY.

Criteria:
- correctness (code does what it claims)
- security (no secrets, OWASP Top 10 compliance)
- performance (no N+1 queries, reasonable complexity)
- accessibility (WCAG 2.2 AA if UI changes)
- scope control (no unrelated changes)
- tests and verification coverage

Return ONLY valid JSON:
{
  "status": "APPROVED" | "CHANGES_REQUESTED" | "REJECTED",
  "score": 0-100,
  "notes": "string",
  "required_changes": ["string", ...]
}

PR: ${prUrl}

CI SUMMARY:
${ciSummary}

DIFF:
${diffText}
`.trim();
}

export function buildLearningPrompt(recentIssues: string, recentFixes: string): string {
  return `
You are Javari's continuous learning system. Analyze recent issues and fixes to extract knowledge.

RECENT ISSUES:
${recentIssues}

RECENT FIXES:
${recentFixes}

Extract and return JSON with:
{
  "patterns": [
    {
      "type": "best_practice" | "anti_pattern" | "playbook",
      "title": "string",
      "description": "string",
      "confidence": 0.0-1.0,
      "tags": ["string"]
    }
  ],
  "recommendations": ["string"],
  "resource_suggestions": ["string"]
}
`.trim();
}
