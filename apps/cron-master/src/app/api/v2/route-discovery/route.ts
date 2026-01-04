import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key);
}

/**
 * ChatGPT Requirement: Route Discovery
 * Full crawl + route discovery - sitemap, internal links, Next.js routes.
 */
export async function POST(request: Request) {
  const requestId = `disc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { domain } = body as { domain: string };

    if (!domain) {
      return NextResponse.json({ error: 'domain required', request_id: requestId }, { status: 400 });
    }

    const discoveredRoutes: Array<{
      route_path: string;
      route_type: string;
      discovery_method: string;
      requires_auth: boolean;
      is_critical: boolean;
    }> = [];

    // Method 1: Sitemap.xml
    try {
      const sitemapRes = await fetch(`https://${domain}/sitemap.xml`, { signal: AbortSignal.timeout(10000) });
      if (sitemapRes.ok) {
        const xml = await sitemapRes.text();
        const urls = xml.match(/<loc>([^<]+)<\/loc>/g) || [];
        for (const urlMatch of urls) {
          const url = urlMatch.replace(/<\/?loc>/g, '');
          try {
            const path = new URL(url).pathname;
            discoveredRoutes.push({
              route_path: path,
              route_type: 'page',
              discovery_method: 'sitemap',
              requires_auth: false,
              is_critical: path === '/' || path.includes('login'),
            });
          } catch { /* invalid URL */ }
        }
      }
    } catch { /* sitemap not available */ }

    // Method 2: Crawl homepage
    try {
      const homeRes = await fetch(`https://${domain}`, { signal: AbortSignal.timeout(15000) });
      if (homeRes.ok) {
        const html = await homeRes.text();
        const links = html.match(/href=["']([^"']+)["']/g) || [];
        const seen = new Set(discoveredRoutes.map(r => r.route_path));
        
        for (const linkMatch of links) {
          const href = linkMatch.replace(/href=["']|["']/g, '');
          if (href.startsWith('/') && !href.startsWith('//') && !seen.has(href)) {
            const path = href.split('?')[0].split('#')[0];
            seen.add(path);
            discoveredRoutes.push({
              route_path: path,
              route_type: path.startsWith('/api/') ? 'api' : 'page',
              discovery_method: 'crawl',
              requires_auth: path.includes('dashboard') || path.includes('admin'),
              is_critical: path.includes('login') || path.includes('checkout'),
            });
          }
        }
      }
    } catch { /* crawl failed */ }

    // Store routes
    let stored = 0;
    for (const route of discoveredRoutes) {
      const { error } = await supabase.from('route_inventory').upsert({
        domain,
        ...route,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'domain,route_path', ignoreDuplicates: false });
      if (!error) stored++;
    }

    // Update registry
    await supabase.from('central_registry').upsert({
      asset_type: 'domain',
      asset_name: domain,
      asset_identifier: domain,
      metadata: { routes_discovered: discoveredRoutes.length },
      last_discovered: new Date().toISOString(),
      discovery_source: 'route_discovery_api',
    }, { onConflict: 'asset_identifier' });

    return NextResponse.json({
      request_id: requestId,
      timestamp: new Date().toISOString(),
      domain,
      routes_discovered: discoveredRoutes.length,
      routes_stored: stored,
      summary: {
        pages: discoveredRoutes.filter(r => r.route_type === 'page').length,
        apis: discoveredRoutes.filter(r => r.route_type === 'api').length,
        critical: discoveredRoutes.filter(r => r.is_critical).length,
      },
      routes: discoveredRoutes,
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Route discovery failed',
      details: error instanceof Error ? error.message : 'Unknown',
      request_id: requestId,
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const requestId = `disc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get('domain');

  try {
    const supabase = getSupabase();
    let query = supabase.from('route_inventory').select('*').order('route_path');
    if (domain) query = query.eq('domain', domain);
    const { data: routes } = await query;

    return NextResponse.json({
      request_id: requestId,
      domain: domain || 'all',
      total: routes?.length || 0,
      routes,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch routes', request_id: requestId }, { status: 500 });
  }
}
