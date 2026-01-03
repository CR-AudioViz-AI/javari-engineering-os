import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const limit = parseInt(searchParams.get('limit') || '50');
    
    let query = supabase
      .from('work_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (status) {
      query = query.eq('status', status);
    }
    if (severity) {
      query = query.eq('severity', severity);
    }
    
    const { data, error } = await query;
    
    if (error) {
      // Table might not exist yet
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return NextResponse.json({
          items: [],
          total: 0,
          message: 'Work items table not initialized yet'
        });
      }
      throw error;
    }
    
    return NextResponse.json({
      items: data || [],
      total: data?.length || 0,
      filters: { status, severity, limit }
    });
  } catch (error) {
    console.error('Work items error:', error);
    return NextResponse.json({
      items: [],
      total: 0,
      error: error instanceof Error ? error.message : 'Failed to fetch work items'
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const { data, error } = await supabase
      .from('work_items')
      .insert({
        title: body.title,
        description: body.description,
        severity: body.severity || 'low',
        category: body.category || 'general',
        status: 'new',
        source_audit_id: body.source_audit_id,
        affected_project: body.affected_project,
        affected_file: body.affected_file,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json({ success: true, item: data });
  } catch (error) {
    console.error('Create work item error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create work item' },
      { status: 500 }
    );
  }
}
