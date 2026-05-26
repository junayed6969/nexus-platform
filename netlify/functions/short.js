// netlify/functions/short.js
// URL Shortener — /l/:slug → lookup → track click → redirect to offer

import {
  getSupabase, corsResponse, generateClickId,
  parseDevice, scoreTraffic, getGeo,
  sendTelegram, getTelegramSettings
} from './_utils.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  // Slug comes from path (/l/my-slug) or query param (via redirect rewrite)
  const params = event.queryStringParameters || {};
  let slug     = params.slug || '';

  if (!slug) {
    // Try to extract from path: /.netlify/functions/short?slug=abc or /l/abc
    const pathParts = (event.path || '').split('/').filter(Boolean);
    const lIdx      = pathParts.indexOf('l');
    if (lIdx !== -1 && pathParts[lIdx + 1]) {
      slug = pathParts[lIdx + 1];
    }
  }

  if (!slug) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/html' },
      body: '<h2>Invalid short link</h2>',
    };
  }

  const supabase = getSupabase();

  // ─── Lookup slug ────────────────────────────────────────────────────────────
  const { data: link, error } = await supabase
    .from('links')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !link) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'text/html' },
      body: '<h2>Link not found</h2>',
    };
  }

  // ─── Track click ────────────────────────────────────────────────────────────
  const clickid  = generateClickId();
  const ip       = event.headers['x-forwarded-for']?.split(',')[0]?.trim()
                   || event.headers['client-ip'] || '0.0.0.0';
  const ua       = event.headers['user-agent'] || '';
  const referer  = event.headers['referer'] || '';
  const device   = parseDevice(ua);
  const { ai_score, fraud_flag } = scoreTraffic(ua, ip, referer);
  const { country }              = await getGeo(ip);

  await supabase.from('clicks').insert({
    user_id:    link.user_id,
    clickid,
    network:    link.network || 'short',
    offer:      link.offer_name || slug,
    ip, user_agent: ua, device, country, referer, ai_score, fraud_flag,
  });

  // Increment link click counter
  await supabase
    .from('links')
    .update({ clicks: (link.clicks || 0) + 1 })
    .eq('id', link.id);

  // ─── Telegram notification ──────────────────────────────────────────────────
  const tg = await getTelegramSettings(supabase, link.user_id);
  if (tg.notify_clicks && !fraud_flag) {
    const msg = `🔗 <b>SHORT LINK CLICK</b>\n\n`
              + `Slug: <code>${slug}</code>\n`
              + `Offer: <b>${link.offer_name || 'N/A'}</b>\n`
              + `ClickID: <code>${clickid}</code>\n`
              + `IP: <code>${ip}</code> | 🌍 ${country}\n`
              + `Device: ${device} | Score: ${ai_score}/100`;
    await sendTelegram(tg.telegram_bot_token, tg.telegram_chat_id, msg);
  }

  // ─── Redirect with sid appended ─────────────────────────────────────────────
  let dest = link.destination_url;
  try {
    const url = new URL(dest);
    url.searchParams.set('sid',     clickid);
    url.searchParams.set('clickid', clickid);
    dest = url.toString();
  } catch {
    dest += (dest.includes('?') ? '&' : '?') + `sid=${clickid}&clickid=${clickid}`;
  }

  return {
    statusCode: 302,
    headers: {
      Location:                      dest,
      'Cache-Control':               'no-store',
      'Access-Control-Allow-Origin': '*',
    },
    body: '',
  };
};
