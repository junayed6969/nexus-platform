// netlify/functions/links.js
// CRUD for tracking links (URL shortener management)

import { getSupabase, corsResponse, verifyUser } from './_utils.js';

function generateSlug(len = 7) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let slug = '';
  for (let i = 0; i < len; i++) slug += chars[Math.floor(Math.random() * chars.length)];
  return slug;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  const user = await verifyUser(event);
  if (!user) return corsResponse(401, { error: 'Unauthorized' });

  const supabase = getSupabase();
  const userId   = user.id;
  const method   = event.httpMethod;

  // ─── GET: list user's links ────────────────────────────────────────────────
  if (method === 'GET') {
    const { data, error } = await supabase
      .from('links')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return corsResponse(500, { error: error.message });
    return corsResponse(200, { links: data || [] });
  }

  // ─── POST: create a new link ───────────────────────────────────────────────
  if (method === 'POST') {
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch {}

    const { destination_url, network, offer_name, custom_slug } = body;
    if (!destination_url) return corsResponse(400, { error: 'destination_url is required' });

    // Validate URL
    try { new URL(destination_url); } catch {
      return corsResponse(400, { error: 'Invalid destination_url' });
    }

    let slug = custom_slug?.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '') || generateSlug();

    // Ensure slug uniqueness
    const { data: existing } = await supabase.from('links').select('id').eq('slug', slug).single();
    if (existing) slug = slug + '-' + generateSlug(4);

    const { data, error } = await supabase
      .from('links')
      .insert({ user_id: userId, slug, destination_url, network, offer_name })
      .select()
      .single();

    if (error) return corsResponse(500, { error: error.message });
    return corsResponse(201, { link: data });
  }

  // ─── DELETE: remove a link ─────────────────────────────────────────────────
  if (method === 'DELETE') {
    const p      = event.queryStringParameters || {};
    const linkId = p.id;
    if (!linkId) return corsResponse(400, { error: 'Missing id' });

    const { error } = await supabase
      .from('links')
      .delete()
      .eq('id', linkId)
      .eq('user_id', userId);

    if (error) return corsResponse(500, { error: error.message });
    return corsResponse(200, { ok: true });
  }

  return corsResponse(405, { error: 'Method not allowed' });
};
