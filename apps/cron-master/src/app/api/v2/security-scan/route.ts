import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

interface SecurityFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  title: string;
  description: string;
  recommendation?: string;
}

/**
 * ChatGPT Requirement: Security Scans
 * 
 * Run security checks: headers, SSL, common vulnerabilities.
 * Full CodeQL/Semgrep/OWASP ZAP require separate CI integration.
 */
export async function POST(request: Request) {
  const requestId = `sec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { domain, url, scan_type = 'headers' } = body as { 
      domain?: string;
      url?: string;
      scan_type?: 'headers' | 'ssl' | 'full';
    };

    const targetUrl = url || (domain ? `https://${domain}` : null);
    if (!targetUrl) {
      return NextResponse.json({
        error: 'url or domain required',
        request_id: requestId,
      }, { status: 400 });
    }

    const targetDomain = domain || new URL(targetUrl).hostname;
    const findings: SecurityFinding[] = [];

    // Fetch headers for analysis
    let headers: Record<string, string> = {};
    let sslInfo: { valid: boolean; error?: string } = { valid: true };

    try {
      const res = await fetch(targetUrl, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(15000),
        redirect: 'follow'
      });

      res.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      // Check security headers
      const securityHeaders = [
        { header: 'strict-transport-security', name: 'HSTS', severity: 'high' as const },
        { header: 'x-content-type-options', name: 'X-Content-Type-Options', severity: 'medium' as const },
        { header: 'x-frame-options', name: 'X-Frame-Options', severity: 'medium' as const },
        { header: 'x-xss-protection', name: 'X-XSS-Protection', severity: 'low' as const },
        { header: 'content-security-policy', name: 'CSP', severity: 'high' as const },
        { header: 'referrer-policy', name: 'Referrer-Policy', severity: 'low' as const },
        { header: 'permissions-policy', name: 'Permissions-Policy', severity: 'low' as const },
      ];

      for (const { header, name, severity } of securityHeaders) {
        if (!headers[header]) {
          findings.push({
            severity,
            category: 'headers',
            title: `Missing ${name} header`,
            description: `The ${name} security header is not set.`,
            recommendation: `Add ${name} header to improve security.`
          });
        }
      }

      // Check for server disclosure
      if (headers['server'] && !headers['server'].toLowerCase().includes('cloudflare')) {
        findings.push({
          severity: 'info',
          category: 'headers',
          title: 'Server header reveals technology',
          description: `Server header exposes: ${headers['server']}`,
          recommendation: 'Consider removing or obfuscating the Server header.'
        });
      }

      // Check for X-Powered-By
      if (headers['x-powered-by']) {
        findings.push({
          severity: 'low',
          category: 'headers',
          title: 'X-Powered-By header reveals technology',
          description: `X-Powered-By header exposes: ${headers['x-powered-by']}`,
          recommendation: 'Remove the X-Powered-By header.'
        });
      }

      // Check HTTPS
      if (!targetUrl.startsWith('https://')) {
        findings.push({
          severity: 'critical',
          category: 'ssl',
          title: 'Not using HTTPS',
          description: 'Site is accessible over insecure HTTP.',
          recommendation: 'Enforce HTTPS for all traffic.'
        });
      }

    } catch (err) {
      if (err instanceof Error && err.message.includes('certificate')) {
        sslInfo = { valid: false, error: err.message };
        findings.push({
          severity: 'critical',
          category: 'ssl',
          title: 'SSL Certificate Error',
          description: err.message,
          recommendation: 'Fix SSL certificate configuration.'
        });
      } else {
        findings.push({
          severity: 'high',
          category: 'connectivity',
          title: 'Unable to connect',
          description: err instanceof Error ? err.message : 'Connection failed',
          recommendation: 'Verify the site is accessible.'
        });
      }
    }

    // Calculate severity counts
    const severityCounts = {
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
      info: findings.filter(f => f.severity === 'info').length,
    };

    const pass = severityCounts.critical === 0 && severityCounts.high === 0;

    // Store results
    const { data: scanRecord } = await supabase.from('security_scans').insert({
      scan_type,
      target: targetUrl,
      domain: targetDomain,
      severity_counts: severityCounts,
      findings_count: findings.length,
      findings,
      pass,
      request_id: requestId,
      environment_signature: {
        scan_mode: 'headers',
        note: 'Full OWASP/CodeQL requires CI integration'
      }
    }).select('id').single();

    // Store in metrics_json for proof
    await supabase.from('metrics_json').insert({
      metric_key: `security_scan_${targetDomain}`,
      metric_value: {
        pass,
        findings_count: findings.length,
        severity_counts: severityCounts
      },
      computed_from: ['security_scans'],
      evidence_ids: scanRecord ? [scanRecord.id] : [],
    });

    return NextResponse.json({
      request_id: requestId,
      timestamp: new Date().toISOString(),
      url: targetUrl,
      domain: targetDomain,
      scan_type,
      result: {
        pass,
        findings_count: findings.length,
        severity_counts: severityCounts,
      },
      findings,
      ssl: sslInfo,
      headers_checked: Object.keys(headers).length,
      record_id: scanRecord?.id,
      note: 'Header-based scan. Full OWASP ZAP/CodeQL/Semgrep require CI integration.'
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Security scan failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId,
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const requestId = `sec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get('domain');

  try {
    const supabase = getSupabase();
    
    let query = supabase
      .from('security_scans')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(20);
    if (domain) query = query.eq('domain', domain);
    const { data: scans } = await query;

    return NextResponse.json({
      request_id: requestId,
      domain: domain || 'all',
      total_scans: scans?.length || 0,
      pass_rate: scans && scans.length > 0 
        ? Math.round((scans.filter(s => s.pass).length / scans.length) * 100) 
        : 0,
      recent_scans: scans || [],
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to fetch security scans',
      request_id: requestId,
    }, { status: 500 });
  }
}
