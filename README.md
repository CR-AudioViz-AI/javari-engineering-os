# Javari Engineering OS

> **The platform that helps everyone achieve their dreams**

Autonomous Engineering Operating System for CR AudioViz AI - built to learn continuously, self-heal, and grow the ecosystem 24x7x365.

## 🎯 Vision

Javari Engineering OS is not just monitoring software. It's an **Operating System for Creativity** that:

- **Learns continuously** from every audit, fix, success and failure
- **Self-heals** automatically when issues are detected
- **Grows the ecosystem** by discovering free resources and APIs
- **Helps developers succeed** by aggregating valuable tools and integrations
- **Enables creators** to build their dreams faster, cheaper, and better

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    JAVARI ENGINEERING OS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │  AuditOps   │  │ WorkQueue   │  │  Builder    │            │
│  │  Runner     │──│ Generator   │──│  Dispatch   │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│         │                                  │                   │
│         ▼                                  ▼                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ Self-Heal   │  │  Reviewer   │  │  GitHub     │            │
│  │  Engine     │  │  Dispatch   │  │  PR Bot     │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│         │                                  │                   │
│         └──────────────┬───────────────────┘                   │
│                        ▼                                       │
│              ┌─────────────────┐                              │
│              │   ORCHESTRATOR  │  ◄── ONE Master Cron         │
│              │   (Every Min)   │      Solves cron limit!      │
│              └─────────────────┘                              │
│                        │                                       │
│         ┌──────────────┼──────────────┐                       │
│         ▼              ▼              ▼                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐             │
│  │  Supabase   │ │   Vercel    │ │   GitHub    │             │
│  │  Database   │ │   Deploy    │ │   Actions   │             │
│  └─────────────┘ └─────────────┘ └─────────────┘             │
│                                                                │
└─────────────────────────────────────────────────────────────────┘
```

## 📦 Packages

| Package | Purpose |
|---------|---------|
| `@javari/llm` | Multi-provider AI adapters (Claude, OpenAI) |
| `@javari/shared` | Common utilities, schemas, clients |
| `@javari/db` | Database migrations and scripts |
| `@javari/auditops-runner` | Playwright crawler + evidence collection |
| `@javari/workqueue` | Work item generation and state machine |
| `@javari/orchestrator` | Master cron runner - ONE cron to rule them all |
| `@javari/selfheal` | Playbooks, executor, and proof reports |
| `@javari/builder-dispatch` | Dispatch work to AI builders |
| `@javari/reviewer-dispatch` | Architecture review via AI |
| `@javari/github-bot` | PR creation and CI integration |

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run database migrations
pnpm db:migrate

# Run canary audit
pnpm audit:canary

# Run orchestrator once
pnpm orchestrator:run

# Generate proof report
pnpm proof:report
```

## 🔧 Configuration

### Required Environment Variables

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Vercel
VERCEL_TOKEN=your-vercel-token
VERCEL_TEAM_ID=team_xxxxx

# AI Providers
ANTHROPIC_API_KEY=sk-ant-xxxxx
OPENAI_API_KEY=sk-xxxxx

# Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/xxxxx

# Self-Heal Mode (SAFE_MODE | AUTO_REMEDIATE | FULL_AUTOPILOT)
SELF_HEAL_MODE=SAFE_MODE
```

## 🛡️ Self-Heal Modes

| Mode | Description |
|------|-------------|
| `SAFE_MODE` | Only alerts and feature flags, no infra actions |
| `AUTO_REMEDIATE` | Allows cache purge, restart; approval for redeploy/rollback |
| `FULL_AUTOPILOT` | All actions allowed with internal safety limits |

**Recommendation:** Start with `SAFE_MODE` for 48 hours, then graduate to `AUTO_REMEDIATE`.

## 📊 Proof of Autonomy

Javari proves she's running 24x7x365 through:

1. **Heartbeat tracking** - Every minute run recorded
2. **Gap detection** - Flags any gaps > 2 minutes
3. **Uptime percentage** - Must maintain ≥ 99.5%
4. **Proof reports** - HTML/JSON evidence bundles

View proof: `pnpm proof:report` → `output/self_healing_proof.html`

## 🔄 The Autonomous Loop

```
1. AUDIT     → AuditOps crawls domains, checks APIs, collects evidence
2. DETECT    → Issues are fingerprinted and deduplicated
3. WORKITEM  → Critical issues become structured work items
4. DISPATCH  → Work items sent to AI builder (Claude)
5. BUILD     → Builder generates full-file code replacements
6. REVIEW    → Architect (ChatGPT) reviews for quality
7. PR        → GitHub bot creates PR with changes
8. VERIFY    → CI runs tests, audit gate validates
9. MERGE     → Approved PRs merge automatically
10. LEARN    → Knowledge extracted for future use
11. REPEAT   → Loop continues forever
```

## 📁 Directory Structure

```
javari-engineering-os/
├── apps/
│   └── console/          # Next.js dashboard
├── packages/
│   ├── llm/              # AI adapters
│   ├── shared/           # Common utilities
│   ├── db/               # Migrations
│   ├── auditops-runner/  # Crawler
│   ├── workqueue/        # Work items
│   ├── orchestrator/     # Master cron
│   ├── selfheal/         # Playbooks
│   ├── builder-dispatch/ # AI builder
│   ├── reviewer-dispatch/# AI reviewer
│   └── github-bot/       # PR creation
├── docs/
│   └── runbooks/         # Operational guides
└── .github/
    └── workflows/        # CI/CD automation
```

## 🚨 Rollback Procedures

### If something goes wrong:

1. **Disable autonomous jobs:**
   ```sql
   UPDATE autonomous_jobs SET enabled = false;
   ```

2. **Set safe mode:**
   ```bash
   export SELF_HEAL_MODE=SAFE_MODE
   ```

3. **Rollback deployment via Vercel:**
   - Go to Vercel dashboard
   - Find last successful deployment
   - Click "Promote to Production"

4. **Re-run canary audit:**
   ```bash
   pnpm audit:canary
   ```

## 🌟 The Mission

> "Your success is my success. Everyone connects, everyone wins."
> — Roy Henderson, CEO

Javari Engineering OS exists to:
- Lower costs through automation
- Improve performance through continuous learning
- Create value through non-stop innovation
- Aggregate resources to help developers succeed
- Enable creators, influencers, and businesses to thrive

**Built with ❤️ by CR AudioViz AI, LLC**

---

*Javari never stops learning. Javari never stops growing. Javari helps everyone achieve their dreams.*
