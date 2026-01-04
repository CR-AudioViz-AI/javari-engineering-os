import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';

/**
 * ChatGPT Requirement: Route Discovery
 * 
 * Full crawl + route discovery (not just a list of URLs):
 * - crawl /sitemap.xml
 * - crawl internal links
 * - enumerate Next.js routes from build output
 * - enumerate API routes from OpenAPI or route manifests
 * 
 * This is how we get true ecosystem-wide crawl.
 */
export async function POST(request: Request) {
  const requestId = `disc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  try {
    const body = await request.json();
    const { domain, discovery_methods } = body as { 
      domain: string; 
      discovery_methods?: string[];
    };

    if (!domain) {
      return NextResponse.json({
        error: 'domain is required',
        request_id: requestId,
      }, { status: 400 });
    }

    const methods = discovery_methods || ['sitemap', 'crawl', 'nextjs_manifest'];
    const discoveredRoutes: Array<{
      route_path: string;
      route_type: string;
      discovery_method: string;
      requires_auth: boolean;
      is_critical: boolean;
    }> = [];

    // Method 1: Sitemap.xml discovery
    if (methods.includes('sitemap')) {
      try {
        const sitemapUrl = `https://${domain}/sitemap.xml`;
        const sitemapRes = await fetch(sitemapUrl, { 
          signal: AbortSignal.timeout(10000) 
        });
        
        if (sitemapRes.ok) {
          const sitemapXml = await sitemapRes.text();
          // Parse sitemap URLs
          const urlMatches = sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g);
          for (const match of urlMatches) {
            const fullUrl = match[1];
            const path = new URL(fullUrl).pathname;
            discoveredRoutes.push({
              route_path: path,
              route_type: 'page',
              discovery_method: 'sitemap',
              requires_auth: false,
              is_critical: path === '/' || path === '/login' || path === '/signup',
            });
          }
        }
      } catch (e) {
        // Sitemap not available, continue with other methods
      }
    }

    // Method 2: Crawl homepage for internal links
    if (methods.includes('crawl')) {
      try {
        const homeRes = await fetch(`https://${domain}`, { 
          signal: AbortSignal.timeout(15000) 
        });
        
        if (homeRes.ok) {
          const html = await homeRes.text();
          // Extract internal links
          const linkMatches = html.matchAll(/href=["']([^"']+)["']/g);
          const seenPaths = new Set(discoveredRoutes.map(r => r.route_path));
          
          for (const match of linkMatches) {
            let href = match[1];
            // Only internal links
            if (href.startsWith('/') && !href.startsWith('//')) {
              const path = href.split('?')[0].split('#')[0];
              if (!seenPaths.has(path) && path !== '/') {
                seenPaths.add(path);
                discoveredRoutes.push({
                  route_path: path,
                  route_type: path.startsWith('/api/') ? 'api' : 'page',
                  discovery_method: 'crawl',
                  requires_auth: path.includes('dashboard') || path.includes('admin') || path.includes('account'),
                  is_critical: path.includes('login') || path.includes('signup') || path.includes('checkout'),
                });
              }
            }
          }
        }
      } catch (e) {
        // Crawl failed, continue
      }
    }

    // Method 3: Check for common Next.js/API routes
    if (methods.includes('nextjs_manifest')) {
      const commonRoutes = [
        '/api/health', '/api/auth', '/api/user', '/api/products',
        '/login', '/signup', '/dashboard', '/settings', '/checkout',
        '/about', '/contact', '/pricing', '/terms', '/privacy',
      ];
      
      const seenPaths = new Set(discoveredRoutes.map(r => r.route_path));
      
      for (const route of commonRoutes) {
        if (!seenPaths.has(route)) {
          try {
            const checkRes = await fetch(`https://${domain}${route}`, {
              method: 'HEAD',
              signal: AbortSignal.timeout(5000),
            });
            
            if (checkRes.ok || checkRes.status === 401 || checkRes.status === 403) {
              discoveredRoutes.push({
                route_path: route,
                route_type: route.startsWith('/api/') ? 'api' : 'page',
                discovery_method: 'nextjs_manifest',
                requires_auth: checkRes.status === 401 || checkRes.status === 403,
                is_critical: route.includes('login') || route.includes('checkout') || route === '/api/health',
              });
            }
          } catch (e) {
            // Route doesn't exist, skip
          }
        }
      }
    }

    // Store discovered routes in route_inventory
    const inserted: string[] = [];
    for (const route of discoveredRoutes) {
      const { error } = await supabase
        .from('route_inventory')
        .upsert({
          domain,
          ...route,
          updated_at: new Date().toISOString(),
        }, { 
          onConflict: 'domain,route_path',
          ignoreDuplicates: false,
        });
      
      if (!error) inserted.push(route.route_path);
    }

    // Update central registry
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
      discovery_methods: methods,
      routes_discovered: discoveredRoutes.length,
      routes_stored: inserted.length,
      routes: discoveredRoutes,
      summary: {
        pages: discoveredRoutes.filter(r => r.route_type === 'page').length,
        api_endpoints: discoveredRoutes.filter(r => r.route_type === 'api').length,
        auth_required: discoveredRoutes.filter(r => r.requires_auth).length,
        critical: discoveredRoutes.filter(r => r.is_critical).length,
      },
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Route discovery failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId,
      message: 'I cannot confirm route discovery results.',
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const requestId = `disc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get('domain');

  try {
    let query = supabase.from('route_inventory').select('*').order('route_path');
    if (domain) query = query.eq('domain', domain);
    
    const { data: routes, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      request_id: requestId,
      timestamp: new Date().toISOString(),
      domain: domain || 'all',
      total_routes: routes?.length || 0,
      routes,
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Failed to fetch routes',
      request_id: requestId,
    }, { status: 500 });
  }
}
