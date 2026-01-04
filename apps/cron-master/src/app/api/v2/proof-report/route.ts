1;
          return acc;
        }, {} as Record<string, number>) || {},
        artifacts: evidence?.slice(0, 20).map(e => ({
          id: e.id,
          type: e.artifact_type,
          url: e.storage_url || e.url,
          request_id: e.request_id,
        })) || [],
      },

      // Final assessment - ONLY if we have evidence
      assessment: {
        can_make_claims: (metrics && metrics.length > 0) || (verifiedClaims && verifiedClaims.length > 0),
        metrics_count: metrics?.length || 0,
        verified_claims_count: verifiedClaims?.length || 0,
        evidence_artifacts_count: evidence?.length || 0,
        message: (metrics && metrics.length > 0)
          ? `This report contains ${metrics.length} metrics with evidence. All claims are verifiable.`
          : 'I cannot confirm any metrics. No claims can be made from this audit.',
      },
    };

    // Generate markdown if requested
    if (format === 'markdown') {
      const md = `# Proof-Grade Audit Report

## Meta
- **Generated:** ${report.meta.generated_at}
- **Audit Run ID:** ${report.meta.audit_run_id}
- **Request ID:** ${report.meta.request_id}
- **Proof Method:** All claims derived from metrics_json with evidence

## Verified Metrics (${report.verified_metrics.length})
${report.verified_metrics.map(m => `- **${m.metric}**: ${JSON.stringify(m.value)} (Evidence: ${m.evidence_ids?.join(', ') || 'N/A'})`).join('\n')}

## Verified Claims (${report.verified_claims.length})
${report.verified_claims.map(c => `- ${c.claim}: ${c.value} (Verified: ${c.verified_at})`).join('\n')}

## Coverage
${typeof report.coverage === 'object' && 'by_domain' in report.coverage
  ? report.coverage.by_domain.map((d: any) => `- **${d.domain}**: ${d.routes_audited}/${d.routes_discovered} routes (${d.coverage_pct}%)`).join('\n')
  : report.coverage.message}

## Experience Scores
${typeof report.experience === 'object' && 'avg_score' in report.experience
  ? `- Average Score: ${report.experience.avg_score}/100\n- Pass Rate: ${report.experience.pass_rate}%\n- Total Runs: ${report.experience.total_runs}`
  : report.experience.message}

## Assessment
${report.assessment.message}

---
*This report is proof-only. No claims without evidence in metrics_json.*
`;

      return new NextResponse(md, {
        headers: {
          'Content-Type': 'text/markdown',
          'X-Request-ID': requestId,
        },
      });
    }

    return NextResponse.json(report);

  } catch (error) {
    return NextResponse.json({
      error: 'Proof report generation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId,
      message: 'I cannot confirm this report.',
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const requestId = `rpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    const body = await request.json();
    const { run_type } = body as { run_type?: string };

    // Create new audit run
    const { data: auditRun, error } = await supabase
      .from('audit_runs')
      .insert({
        run_type: run_type || 'manual',
        status: 'running',
        started_at: new Date().toISOString(),
        environment_signature: {
          node_env: process.env.NODE_ENV,
          region: process.env.VERCEL_REGION || 'unknown',
          supabase_url: process.env.SUPABASE_URL?.replace(/https:\/\/([^.]+).*/, '$1'),
        },
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({
      request_id: requestId,
      timestamp: new Date().toISOString(),
      audit_run_id: auditRun?.id,
      status: 'running',
      message: 'Audit run started. Use GET /api/v2/proof-report?audit_run_id=... to get results.',
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Failed to start audit run',
      details: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId,
    }, { status: 500 });
  }
}
