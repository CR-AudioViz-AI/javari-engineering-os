-- ==========================================================================
-- JAVARI ENGINEERING OS - COMPLETE DATABASE SCHEMA
-- Version: 1.0.0
-- Purpose: Full autonomous monitoring, self-healing, work queue, and discovery
-- ==========================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==========================================================================
-- ENUMS
-- ==========================================================================

DO $$
BEGIN
  -- Work Item Status
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_item_status') THEN
    CREATE TYPE work_item_status AS ENUM (
      'NEW', 'DISPATCHED', 'IN_PROGRESS', 'PR_OPENED', 'VERIFIED',
      'MERGED', 'DEPLOYED', 'BLOCKED', 'FAILED', 'SUPPRESSED'
    );
  END IF;

  -- Severity Levels
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'severity_level') THEN
    CREATE TYPE severity_level AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');
  END IF;

  -- Work Item Categories
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_category') THEN
    CREATE TYPE work_category AS ENUM (
      'OPS', 'SECURITY', 'API', 'SEO', 'A11Y', 'PERF', 
      'UX', 'DATA', 'PAYMENTS', 'AUTH', 'COST', 'LEARNING', 'OTHER'
    );
  END IF;

  -- Autonomous Run Status
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'run_status') THEN
    CREATE TYPE run_status AS ENUM ('RUNNING', 'SUCCESS', 'FAIL', 'DEGRADED', 'TIMEOUT', 'SKIPPED');
  END IF;

  -- Self-Heal Action Types
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'heal_action_type') THEN
    CREATE TYPE heal_action_type AS ENUM (
      'RESTART', 'REDEPLOY', 'ROLLBACK', 'CACHE_PURGE', 
      'FEATURE_FLAG_TOGGLE', 'QUARANTINE', 'NOTIFY', 'LEARN'
    );
  END IF;

  -- Self-Heal Action Status
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'action_status') THEN
    CREATE TYPE action_status AS ENUM ('PLANNED', 'EXECUTING', 'SUCCESS', 'FAILED', 'ROLLED_BACK');
  END IF;

  -- Platform Registry Types
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'registry_type') THEN
    CREATE TYPE registry_type AS ENUM (
      'domain', 'vercel_project', 'github_repo', 'supabase_project', 
      'api_endpoint', 'free_resource', 'partner_integration'
    );
  END IF;
END $$;

-- ==========================================================================
-- HELPER FUNCTIONS
-- ==========================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.list_tables()
RETURNS TABLE(table_name TEXT) 
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT table_name::TEXT
  FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name;
$$;

-- ==========================================================================
-- AUTONOMOUS JOBS (Master Cron System)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS autonomous_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Scheduling
  schedule_type TEXT NOT NULL DEFAULT 'interval', -- interval|cron
  cron_expression TEXT,
  interval_seconds INTEGER DEFAULT 60,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  
  -- Execution Config
  timeout_ms INTEGER NOT NULL DEFAULT 60000,
  max_retries INTEGER NOT NULL DEFAULT 3,
  backoff_ms INTEGER NOT NULL DEFAULT 15000,
  priority INTEGER NOT NULL DEFAULT 50,
  
  -- Handler
  handler TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  
  -- State
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  last_status run_status,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0
);

CREATE TRIGGER trg_autonomous_jobs_updated
  BEFORE UPDATE ON autonomous_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- AUTONOMOUS RUNS (Execution History)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS autonomous_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES autonomous_jobs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status run_status NOT NULL DEFAULT 'RUNNING',
  
  -- Metrics
  heartbeat BOOLEAN NOT NULL DEFAULT FALSE,
  issues_detected_count INTEGER NOT NULL DEFAULT 0,
  fixes_applied_count INTEGER NOT NULL DEFAULT 0,
  verification_passed BOOLEAN NOT NULL DEFAULT FALSE,
  duration_ms INTEGER,
  
  -- Evidence
  logs_url TEXT,
  evidence_urls TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT,
  error TEXT,
  
  -- Environment
  region TEXT,
  runtime_version TEXT
);

-- ==========================================================================
-- AUTONOMOUS ACTIONS (Self-Healing Actions)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS autonomous_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES autonomous_runs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  action_type heal_action_type NOT NULL,
  action_status action_status NOT NULL DEFAULT 'PLANNED',
  
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  
  before_state JSONB NOT NULL DEFAULT '{}',
  after_state JSONB NOT NULL DEFAULT '{}',
  verification JSONB NOT NULL DEFAULT '{}',
  
  evidence_urls TEXT[] NOT NULL DEFAULT '{}',
  error TEXT
);

-- ==========================================================================
-- AUTONOMOUS ALERTS
-- ==========================================================================

CREATE TABLE IF NOT EXISTS autonomous_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES autonomous_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  severity severity_level NOT NULL DEFAULT 'MEDIUM',
  channel TEXT NOT NULL, -- slack|email|webhook|console
  message TEXT NOT NULL,
  
  sent_to TEXT,
  sent_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- ==========================================================================
-- CRON LOCKS (Prevent Concurrent Execution)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS cron_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_key TEXT NOT NULL UNIQUE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  acquired_by TEXT NOT NULL
);

-- ==========================================================================
-- AUDIT RUNS
-- ==========================================================================

CREATE TABLE IF NOT EXISTS audit_runs (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  domain TEXT NOT NULL,
  scope TEXT NOT NULL, -- full|canary|gate
  status TEXT NOT NULL DEFAULT 'RUNNING',
  
  -- Environment Fingerprinting (CRITICAL for consistency)
  supabase_url TEXT,
  supabase_project_ref TEXT,
  db_signature TEXT,
  
  report_url TEXT,
  artifacts JSONB NOT NULL DEFAULT '{}',
  summary JSONB NOT NULL DEFAULT '{}'
);

-- ==========================================================================
-- AUDIT ISSUES
-- ==========================================================================

CREATE TABLE IF NOT EXISTS audit_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  fingerprint TEXT NOT NULL,
  severity severity_level NOT NULL,
  category work_category NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  
  details JSONB NOT NULL DEFAULT '{}',
  evidence JSONB NOT NULL DEFAULT '{}'
);

-- ==========================================================================
-- WORK ITEMS (Work Queue)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Deduplication
  fingerprint TEXT NOT NULL UNIQUE,
  
  -- Core
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity severity_level NOT NULL DEFAULT 'MEDIUM',
  category work_category NOT NULL DEFAULT 'OTHER',
  status work_item_status NOT NULL DEFAULT 'NEW',
  
  -- Scope
  domain TEXT,
  repo TEXT,
  vercel_project_id TEXT,
  route_or_endpoint TEXT,
  
  -- Plans
  recommended_fix TEXT,
  acceptance_criteria JSONB NOT NULL DEFAULT '[]',
  verification_plan JSONB NOT NULL DEFAULT '[]',
  rollback_plan JSONB NOT NULL DEFAULT '[]',
  
  -- Evidence
  evidence_urls TEXT[] NOT NULL DEFAULT '{}',
  source_run_id UUID,
  source_issue_fingerprint TEXT,
  
  -- Assignment
  assigned_to TEXT,
  assigned_model TEXT DEFAULT 'claude',
  created_by TEXT DEFAULT 'auditops',
  tags TEXT[] NOT NULL DEFAULT '{}',
  
  -- Execution State
  priority_score INTEGER NOT NULL DEFAULT 50,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  cooldown_until TIMESTAMPTZ,
  
  -- Approval
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by TEXT,
  approved_at TIMESTAMPTZ
);

CREATE TRIGGER trg_work_items_updated
  BEFORE UPDATE ON work_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- WORK RUNS (Execution Attempts)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS work_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  status TEXT NOT NULL DEFAULT 'RUNNING',
  attempt_number INTEGER NOT NULL DEFAULT 1,
  runner TEXT NOT NULL DEFAULT 'orchestrator',
  builder_model TEXT,
  
  logs_url TEXT,
  output_summary TEXT,
  error TEXT
);

-- ==========================================================================
-- WORK REVIEWS (Architect Review)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS work_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  reviewer_model TEXT NOT NULL DEFAULT 'chatgpt',
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING|APPROVED|CHANGES_REQUESTED|REJECTED
  score INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  required_changes JSONB NOT NULL DEFAULT '[]'
);

-- ==========================================================================
-- WORK ARTIFACTS
-- ==========================================================================

CREATE TABLE IF NOT EXISTS work_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  artifact_type TEXT NOT NULL, -- prompt|response|diff|report|evidence|ci_logs|pr
  url TEXT NOT NULL,
  sha256 TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- ==========================================================================
-- FEATURE FLAGS (Safe Mode Controls)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'global',
  target TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

-- ==========================================================================
-- PLATFORM REGISTRY (Future-Proof Discovery)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS platform_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  type registry_type NOT NULL,
  name TEXT NOT NULL,
  external_id TEXT,
  url TEXT,
  
  -- Status
  active BOOLEAN NOT NULL DEFAULT TRUE,
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  tier TEXT DEFAULT 'standard', -- critical|primary|standard|experimental
  
  -- Ownership
  owner TEXT,
  
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_registry_unique 
  ON platform_registry(type, name);

CREATE TRIGGER trg_platform_registry_updated
  BEFORE UPDATE ON platform_registry
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- KNOWLEDGE BASE (Continuous Learning)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  category TEXT NOT NULL, -- playbook|best_practice|pattern|anti_pattern|resource
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  
  -- Source
  learned_from TEXT, -- audit|fix|incident|manual
  source_work_item_id UUID REFERENCES work_items(id),
  
  -- Quality
  confidence_score NUMERIC(3,2) DEFAULT 0.5,
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_rate NUMERIC(3,2),
  
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE TRIGGER trg_knowledge_base_updated
  BEFORE UPDATE ON knowledge_base
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- FREE RESOURCES REGISTRY (API/Asset Aggregator)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS free_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  category TEXT NOT NULL, -- api|dataset|image|icon|font|template|tool
  name TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  
  -- Access
  requires_key BOOLEAN NOT NULL DEFAULT FALSE,
  rate_limit TEXT,
  
  -- Quality
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  last_checked_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active', -- active|deprecated|broken
  
  -- Value
  use_cases TEXT[] NOT NULL DEFAULT '{}',
  integration_notes TEXT,
  
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_free_resources_unique 
  ON free_resources(category, name);

CREATE TRIGGER trg_free_resources_updated
  BEFORE UPDATE ON free_resources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- SYSTEM HEALTH (Real-Time Status)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS system_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  component TEXT NOT NULL,
  status TEXT NOT NULL, -- GREEN|YELLOW|RED
  detail TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'
);

-- ==========================================================================
-- INDEXES
-- ==========================================================================

CREATE INDEX IF NOT EXISTS idx_autonomous_jobs_enabled ON autonomous_jobs(enabled);
CREATE INDEX IF NOT EXISTS idx_autonomous_runs_job ON autonomous_runs(job_id);
CREATE INDEX IF NOT EXISTS idx_autonomous_runs_created ON autonomous_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_autonomous_runs_status ON autonomous_runs(status);
CREATE INDEX IF NOT EXISTS idx_autonomous_actions_run ON autonomous_actions(run_id);
CREATE INDEX IF NOT EXISTS idx_audit_issues_run ON audit_issues(run_id);
CREATE INDEX IF NOT EXISTS idx_audit_issues_fingerprint ON audit_issues(fingerprint);
CREATE INDEX IF NOT EXISTS idx_audit_issues_severity ON audit_issues(severity);
CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_work_items_severity ON work_items(severity);
CREATE INDEX IF NOT EXISTS idx_work_items_fingerprint ON work_items(fingerprint);
CREATE INDEX IF NOT EXISTS idx_work_runs_item ON work_runs(work_item_id);
CREATE INDEX IF NOT EXISTS idx_work_reviews_item ON work_reviews(work_item_id);
CREATE INDEX IF NOT EXISTS idx_work_artifacts_item ON work_artifacts(work_item_id);
CREATE INDEX IF NOT EXISTS idx_cron_locks_key ON cron_locks(lock_key);
CREATE INDEX IF NOT EXISTS idx_cron_locks_expires ON cron_locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_free_resources_category ON free_resources(category);

-- ==========================================================================
-- ROW LEVEL SECURITY
-- ==========================================================================

ALTER TABLE autonomous_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE autonomous_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE autonomous_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE autonomous_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE free_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_health ENABLE ROW LEVEL SECURITY;

-- Read policies for authenticated users
CREATE POLICY "authenticated_read" ON autonomous_jobs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON autonomous_runs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON autonomous_actions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON autonomous_alerts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON cron_locks FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON audit_runs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON audit_issues FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON work_items FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON work_runs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON work_reviews FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON work_artifacts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON feature_flags FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON platform_registry FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON knowledge_base FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON free_resources FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON system_health FOR SELECT USING (auth.role() = 'authenticated');

-- Service role bypasses RLS automatically

-- ==========================================================================
-- SEED DATA: Default Jobs
-- ==========================================================================

INSERT INTO autonomous_jobs (name, description, enabled, schedule_type, interval_seconds, priority, handler, config)
VALUES 
  ('heartbeat', 'Proof-of-life for autonomous runtime', TRUE, 'interval', 60, 100, 'heartbeat', '{}'),
  ('auditops_canary', 'Canary audit of critical pages/APIs', TRUE, 'interval', 3600, 90, 'auditops.canary', '{"domain": "https://craudiovizai.com"}'),
  ('auditops_full', 'Full crawl and comprehensive checks', TRUE, 'interval', 86400, 80, 'auditops.full', '{"domain": "https://craudiovizai.com"}'),
  ('workqueue_generator', 'Generate work items from latest audit', TRUE, 'interval', 7200, 70, 'workqueue.from_latest_audit', '{}'),
  ('selfheal_monitor', 'Monitor and self-heal issues', TRUE, 'interval', 300, 85, 'selfheal.monitor', '{}'),
  ('discovery_sync', 'Sync platform registry from APIs', TRUE, 'interval', 86400, 50, 'discovery.sync', '{}'),
  ('learning_summarize', 'Summarize learnings from recent work', TRUE, 'interval', 86400, 40, 'learning.summarize', '{}'),
  ('resource_discovery', 'Discover free APIs and resources', TRUE, 'interval', 86400, 30, 'discovery.free_resources', '{}')
ON CONFLICT (name) DO NOTHING;

-- ==========================================================================
-- SEED DATA: Initial Feature Flags
-- ==========================================================================

INSERT INTO feature_flags (key, enabled, description, scope)
VALUES 
  ('SELF_HEAL_MODE', FALSE, 'Master self-healing mode switch', 'global'),
  ('AUTO_REMEDIATE', FALSE, 'Allow automated remediation without approval', 'global'),
  ('FULL_AUTOPILOT', FALSE, 'Full autonomous mode - use with caution', 'global'),
  ('AUTONOMOUS_TEST_MODE', FALSE, 'Enable synthetic failure injection for testing', 'global'),
  ('BUILDER_DISPATCH_ENABLED', FALSE, 'Enable automated builder dispatch', 'global'),
  ('PR_AUTO_CREATE', FALSE, 'Auto-create PRs from builder output', 'global'),
  ('LEARNING_ENABLED', TRUE, 'Enable continuous learning', 'global'),
  ('RESOURCE_DISCOVERY_ENABLED', TRUE, 'Enable free resource discovery', 'global')
ON CONFLICT (key) DO NOTHING;

-- ==========================================================================
-- Grant RPC access
-- ==========================================================================

REVOKE ALL ON FUNCTION public.list_tables() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_tables() TO authenticated, service_role;

-- ==========================================================================
-- Done!
-- ==========================================================================

COMMENT ON TABLE autonomous_jobs IS 'Master cron job definitions - ONE orchestrator runs all';
COMMENT ON TABLE knowledge_base IS 'Continuous learning storage - Javari grows smarter';
COMMENT ON TABLE free_resources IS 'Aggregated free APIs and resources - help developers succeed';
COMMENT ON TABLE platform_registry IS 'Auto-discovered domains, projects, repos - future-proof';
