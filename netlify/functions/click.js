// netlify/functions/click.js
// CPA Click Tracking — records click, scores traffic, redirects to offer

import {
  getSupabase, corsResponse, generateClickId,
  parseDevice, scoreTraffic, getGeo,
  sendTelegram, getTelegramSettings
} from './_utils.js';

export const handler = async (event) => {
  // ─── CORS preflight ────────────────────────────────────────────────────────
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  const params   = event.queryStringParameters || {};
  const userId   = params.user_id;       // required: which SaaS user owns this link
  const network  = params.network  || 'unknown';
  const offer    = params.offer    || 'unknown';
  const dest     = params.dest;          // destination URL to redirect to

  if (!userId) return corsResponse(400, { error: 'Missing user_id parameter' });
  if (!dest)   return corsResponse(400, { error: 'Missing dest (destination URL) parameter' });

  const supabase  = getSupabase();
  const clickid   = generateClickId();
  const ip        = event.headers['x-forwarded-for']?.split(',')[0]?.trim()
                    || event.headers['client-ip']
                    || '0.0.0.0';
  const ua        = event.headers['user-agent'] || '';
  const referer   = event.headers['referer'] || event.headers['referrer'] || '';
  const device    = parseDevice(ua);
  const { ai_score, fraud_flag } = scoreTraffic(ua, ip, referer);
  const { country, language }    = await getGeo(ip);

  // ─── Store click ────────────────────────────────────────────────────────────
  const { error: insertErr } = await supabase.from('clicks').insert({
    user_id:    userId,
    clickid,
    network,
    offer,
    ip,
    user_agent: ua,
    device,
    country,
    language,
    referer,
    ai_score,
    fraud_flag,
  });

  if (insertErr) console.error('Click insert error:', insertErr.message);

  // ─── Telegram notification ──────────────────────────────────────────────────
  const tg = await getTelegramSettings(supabase, userId);
  if (tg.notify_clicks || tg.notify_fraud) {
    const scoreEmoji = ai_score >= 70 ? '🟢' : ai_score >= 40 ? '🟡' : '🔴';
    let msg = fraud_flag
      ? `🚨 <b>FRAUD DETECTED</b>\n\n`
      : `🖱 <b>NEW CLICK</b>\n\n`;
    msg += `Network: <b>${network}</b>\n`
         + `Offer: <b>${offer}</b>\n`
         + `ClickID: <code>${clickid}</code>\n`
         + `IP: <code>${ip}</code>\n`
         + `Device: ${device} | 🌍 ${country}\n`
         + `AI Score: ${scoreEmoji} ${ai_score}/100`
         + (fraud_flag ? '\n⚠️ <b>Flagged as suspicious</b>' : '');

    if (fraud_flag && tg.notify_fraud) {
      await sendTelegram(tg.telegram_bot_token, tg.telegram_chat_id, msg);
    } else if (!fraud_flag && tg.notify_clicks) {
      await sendTelegram(tg.telegram_bot_token, tg.telegram_chat_id, msg);
    }
  }

  // ─── Build redirect URL with sid appended ───────────────────────────────────
  let redirectUrl;
  try {
    const url = new URL(dest);
    url.searchParams.set('sid',     clickid);
    url.searchParams.set('clickid', clickid);
    redirectUrl = url.toString();
  } catch {
    redirectUrl = `${dest}${dest.includes('?') ? '&' : '?'}sid=${clickid}&clickid=${clickid}`;
  }

  return {
    statusCode: 302,
    headers: {
      Location:                      redirectUrl,
      'Cache-Control':               'no-store, no-cache',
      'Access-Control-Allow-Origin': '*',
    },
    body: '',
  };
};
