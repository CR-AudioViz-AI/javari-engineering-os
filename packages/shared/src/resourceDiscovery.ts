/**
 * JAVARI ENGINEERING OS - RESOURCE DISCOVERY
 * Discovers free APIs, datasets, and resources for developers
 * 
 * This is how Javari becomes the aggregator of all possible APIs
 * helping developers achieve their dreams faster, cheaper, better
 */

import { supabaseAdmin } from '@javari/shared';
import { OpenAIAdapter } from '@javari/llm';

// ==========================================================================
// TYPES
// ==========================================================================

interface FreeResource {
  category: string;
  name: string;
  description: string;
  url: string;
  requires_key: boolean;
  rate_limit?: string;
  use_cases: string[];
  tags: string[];
}

interface DiscoveryResult {
  discovered: number;
  added: number;
  updated: number;
  categories: string[];
}

// ==========================================================================
// KNOWN FREE API SOURCES
// ==========================================================================

const FREE_API_LISTS = [
  'https://api.publicapis.org/entries',
  // Add more sources as Javari learns
];

const RESOURCE_CATEGORIES = [
  'api',
  'dataset',
  'image',
  'icon',
  'font',
  'template',
  'tool',
  'ai',
  'storage',
  'auth',
  'payment',
  'communication',
  'analytics',
  'maps',
  'weather',
  'finance',
  'social',
  'entertainment',
  'education',
  'health',
];

// ==========================================================================
// PUBLIC APIS FETCHER
// ==========================================================================

async function fetchPublicAPIs(): Promise<FreeResource[]> {
  try {
    const res = await fetch('https://api.publicapis.org/entries');
    if (!res.ok) return [];
    
    const data = await res.json();
    const entries = data.entries || [];
    
    return entries.slice(0, 100).map((entry: any) => ({
      category: 'api',
      name: entry.API || 'Unknown',
      description: entry.Description || '',
      url: entry.Link || '',
      requires_key: entry.Auth !== '',
      rate_limit: undefined,
      use_cases: [entry.Category?.toLowerCase() || 'general'],
      tags: [
        entry.Category?.toLowerCase(),
        entry.HTTPS ? 'https' : 'http',
        entry.Cors === 'yes' ? 'cors' : undefined,
      ].filter(Boolean) as string[],
    }));
  } catch (err) {
    console.error('[Discovery] Failed to fetch public APIs:', err);
    return [];
  }
}

// ==========================================================================
// AI-POWERED RESOURCE DISCOVERY
// ==========================================================================

async function discoverResourcesWithAI(category: string): Promise<FreeResource[]> {
  const adapter = new OpenAIAdapter();
  
  const prompt = `You are a developer resource curator. Find 5 high-quality FREE ${category} resources that developers can use.

For each resource, provide JSON in this exact format:
{
  "resources": [
    {
      "name": "Resource Name",
      "description": "Brief description of what it does",
      "url": "https://example.com",
      "requires_key": true/false,
      "rate_limit": "1000/day" or null,
      "use_cases": ["use case 1", "use case 2"],
      "tags": ["tag1", "tag2"]
    }
  ]
}

Focus on:
- Truly free resources (not just free trials)
- Well-documented APIs
- Reliable uptime
- Developer-friendly

Category: ${category}

Return ONLY valid JSON.`;

  try {
    const response = await adapter.call({
      provider: 'openai',
      role: 'discoverer',
      model: 'gpt-4o-mini',
      prompt,
      temperature: 0.3,
      maxTokens: 2000,
    });
    
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return (parsed.resources || []).map((r: any) => ({
        ...r,
        category,
      }));
    }
  } catch (err) {
    console.error(`[Discovery] AI discovery failed for ${category}:`, err);
  }
  
  return [];
}

// ==========================================================================
// MAIN DISCOVERY
// ==========================================================================

export async function runResourceDiscovery(categories?: string[]): Promise<DiscoveryResult> {
  const supa = supabaseAdmin();
  const targetCategories = categories || RESOURCE_CATEGORIES.slice(0, 5); // Limit for now
  
  const result: DiscoveryResult = {
    discovered: 0,
    added: 0,
    updated: 0,
    categories: targetCategories,
  };
  
  // Fetch from public APIs
  const publicAPIs = await fetchPublicAPIs();
  result.discovered += publicAPIs.length;
  
  // Store public APIs
  for (const resource of publicAPIs) {
    const { data: existing } = await supa
      .from('free_resources')
      .select('id')
      .eq('category', resource.category)
      .eq('name', resource.name)
      .single();
    
    if (existing) {
      await supa.from('free_resources').update({
        description: resource.description,
        url: resource.url,
        requires_key: resource.requires_key,
        use_cases: resource.use_cases,
        tags: resource.tags,
        last_checked_at: new Date().toISOString(),
      }).eq('id', existing.id);
      result.updated++;
    } else {
      await supa.from('free_resources').insert([{
        category: resource.category,
        name: resource.name,
        description: resource.description,
        url: resource.url,
        requires_key: resource.requires_key,
        rate_limit: resource.rate_limit,
        use_cases: resource.use_cases,
        tags: resource.tags,
        verified: false,
        status: 'active',
      }]);
      result.added++;
    }
  }
  
  // AI-powered discovery for each category
  for (const category of targetCategories) {
    const aiResources = await discoverResourcesWithAI(category);
    result.discovered += aiResources.length;
    
    for (const resource of aiResources) {
      const { data: existing } = await supa
        .from('free_resources')
        .select('id')
        .eq('category', resource.category)
        .eq('name', resource.name)
        .single();
      
      if (!existing) {
        await supa.from('free_resources').insert([{
          category: resource.category,
          name: resource.name,
          description: resource.description,
          url: resource.url,
          requires_key: resource.requires_key,
          rate_limit: resource.rate_limit,
          use_cases: resource.use_cases,
          tags: resource.tags,
          verified: false,
          status: 'active',
        }]);
        result.added++;
      }
    }
    
    // Rate limit AI calls
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(`[Discovery] discovered=${result.discovered}, added=${result.added}, updated=${result.updated}`);
  
  return result;
}

// ==========================================================================
// VERIFY RESOURCES
// ==========================================================================

export async function verifyResources(): Promise<{ verified: number; broken: number }> {
  const supa = supabaseAdmin();
  
  const { data: resources } = await supa
    .from('free_resources')
    .select('id, url')
    .eq('verified', false)
    .limit(20);
  
  let verified = 0;
  let broken = 0;
  
  for (const resource of resources || []) {
    try {
      const res = await fetch(resource.url, { method: 'HEAD' });
      if (res.ok) {
        await supa.from('free_resources').update({
          verified: true,
          status: 'active',
          last_checked_at: new Date().toISOString(),
        }).eq('id', resource.id);
        verified++;
      } else {
        await supa.from('free_resources').update({
          status: 'broken',
          last_checked_at: new Date().toISOString(),
        }).eq('id', resource.id);
        broken++;
      }
    } catch {
      await supa.from('free_resources').update({
        status: 'broken',
        last_checked_at: new Date().toISOString(),
      }).eq('id', resource.id);
      broken++;
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  return { verified, broken };
}

// ==========================================================================
// SEARCH RESOURCES
// ==========================================================================

export async function searchResources(query: string, category?: string): Promise<FreeResource[]> {
  const supa = supabaseAdmin();
  
  let queryBuilder = supa
    .from('free_resources')
    .select('*')
    .eq('status', 'active');
  
  if (category) {
    queryBuilder = queryBuilder.eq('category', category);
  }
  
  // Simple text search (Supabase full-text search would be better)
  queryBuilder = queryBuilder.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
  
  const { data } = await queryBuilder.limit(20);
  
  return (data || []) as FreeResource[];
}

// ==========================================================================
// EXPORTS
// ==========================================================================

export { FreeResource, DiscoveryResult, RESOURCE_CATEGORIES };
