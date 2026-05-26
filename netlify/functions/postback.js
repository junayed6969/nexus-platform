// netlify/functions/postback.js
// CPA Postback receiver — matches sid → click, records conversion

import {
  getSupabase, corsResponse,
  sendTelegram, getTelegramSettings
} from './_utils.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  const p = event.queryStringParameters || {};

  // ─── CPA Macro Parameters ──────────────────────────────────────────────────
  // Networks send: ?sid={clickid}&payout={payout}&offer_name={offer_name}&status={status}
  const sid        = p.sid || p.clickid || p.subid || p.s1 || '';
  const offerName  = p.offer_name || p.offer || p.campaign || 'Unknown Offer';
  const offerId    = p.offer_id   || '';
  const rawPayout  = parseFloat(p.payout || p.revenue || p.amount || '0');
  const payout     = isNaN(rawPayout) ? 0 : rawPayout;
  const rawStatus  = p.status || '1';
  const ipAddr     = p.ip_address || p.ip
                     || event.headers['x-forwarded-for']?.split(',')[0]?.trim()
                     || '0.0.0.0';
  const network    = p.network || p.source || 'unknown';

  // Convert status codes → text
  const statusMap  = { '1': 'approved', '2': 'rejected', 'approved': 'approved', 'rejected': 'rejected', 'pending': 'pending' };
  const status     = statusMap[rawStatus] || 'approved';

  if (!sid) return corsResponse(400, { error: 'Missing sid parameter' });

  const supabase = getSupabase();

  // ─── Look up click by sid ──────────────────────────────────────────────────
  const { data: click, error: clickErr } = await supabase
    .from('clicks')
    .select('id, user_id, fraud_flag, network, offer')
    .eq('clickid', sid)
    .single();

  if (clickErr || !click) {
    console.warn('Postback: clickid not found:', sid);
    return corsResponse(404, { error: 'ClickID not found', sid });
  }

  // ─── Skip fraud clicks ──────────────────────────────────────────────────────
  if (click.fraud_flag) {
    console.warn('Postback: fraud click, skipping conversion for sid:', sid);
    return corsResponse(200, { ok: true, message: 'Fraud click ignored' });
  }

  // ─── Revenue = payout × multiplier (default 1.0, configurable) ─────────────
  const revenue = payout; // Extend: apply user's margin/multiplier here

  // ─── Insert conversion ─────────────────────────────────────────────────────
  const { error: convErr } = await supabase.from('conversions').insert({
    user_id:    click.user_id,
    clickid:    sid,
    network:    network || click.network,
    offer_name: offerName,
    payout,
    revenue,
    status,
    ip:         ipAddr,
  });

  if (convErr) {
    console.error('Conversion insert error:', convErr.message);
    return corsResponse(500, { error: 'Failed to record conversion' });
  }

  // ─── Telegram notification ─────────────────────────────────────────────────
  const tg = await getTelegramSettings(supabase, click.user_id);
  if (tg.notify_conversions) {
    const statusEmoji = status === 'approved' ? '✅' : status === 'rejected' ? '❌' : '⏳';
    const msg = `🔥 <b>NEW CONVERSION</b>\n\n`
              + `${statusEmoji} Status: <b>${status.toUpperCase()}</b>\n`
              + `Offer: <b>${offerName}</b>${offerId ? ` (${offerId})` : ''}\n`
              + `Network: <b>${network || click.network}</b>\n`
              + `Payout: <b>$${payout.toFixed(2)}</b>\n`
              + `Revenue: <b>$${revenue.toFixed(2)}</b>\n`
              + `ClickID: <code>${sid}</code>\n`
              + `IP: <code>${ipAddr}</code>`;
    await sendTelegram(tg.telegram_bot_token, tg.telegram_chat_id, msg);
  }

  return corsResponse(200, {
    ok:         true,
    clickid:    sid,
    offer_name: offerName,
    payout,
    revenue,
    status,
  });
};
