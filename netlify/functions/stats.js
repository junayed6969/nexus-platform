// netlify/functions/stats.js
// Returns aggregated stats for a user: clicks, conversions, revenue, CVR, EPC

import { getSupabase, corsResponse, verifyUser } from './_utils.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────
  const user = await verifyUser(event);
  if (!user) return corsResponse(401, { error: 'Unauthorized' });

  const supabase = getSupabase();
  const userId   = user.id;

  // ─── Date range filter (optional) ─────────────────────────────────────────
  const p       = event.queryStringParameters || {};
  const range   = p.range || '7d'; // 1d | 7d | 30d | all
  const since   = rangeToDate(range);

  let clickQuery = supabase.from('clicks').select('id, fraud_flag, ai_score, device, country, created_at, network, offer').eq('user_id', userId);
  let convQuery  = supabase.from('conversions').select('id, payout, revenue, status, created_at, network, offer_name').eq('user_id', userId);

  if (since) {
    clickQuery = clickQuery.gte('created_at', since);
    convQuery  = convQuery.gte('created_at', since);
  }

  const [{ data: clicks }, { data: conversions }] = await Promise.all([
    clickQuery.order('created_at', { ascending: false }),
    convQuery.order('created_at', { ascending: false }),
  ]);

  const safeClicks  = clicks      || [];
  const safeConvs   = conversions || [];

  // ─── Aggregate ─────────────────────────────────────────────────────────────
  const totalClicks       = safeClicks.length;
  const fraudClicks       = safeClicks.filter(c => c.fraud_flag).length;
  const cleanClicks       = totalClicks - fraudClicks;
  const approvedConvs     = safeConvs.filter(c => c.status === 'approved');
  const totalConversions  = approvedConvs.length;
  const totalRevenue      = approvedConvs.reduce((s, c) => s + (Number(c.revenue) || 0), 0);
  const totalPayout       = approvedConvs.reduce((s, c) => s + (Number(c.payout)  || 0), 0);
  const cvr               = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;
  const epc               = totalClicks > 0 ? totalRevenue / totalClicks : 0;
  const avgAiScore        = safeClicks.length > 0
    ? safeClicks.reduce((s, c) => s + (c.ai_score || 0), 0) / safeClicks.length : 0;

  // Device breakdown
  const deviceMap = {};
  for (const c of safeClicks) {
    deviceMap[c.device || 'unknown'] = (deviceMap[c.device || 'unknown'] || 0) + 1;
  }

  // Country breakdown (top 10)
  const countryMap = {};
  for (const c of safeClicks) {
    if (c.country) countryMap[c.country] = (countryMap[c.country] || 0) + 1;
  }
  const topCountries = Object.entries(countryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([country, count]) => ({ country, count }));

  // Network breakdown
  const networkMap = {};
  for (const c of safeClicks) {
    if (c.network) networkMap[c.network] = (networkMap[c.network] || 0) + 1;
  }

  // Daily chart data (last 14 days)
  const dailyData = buildDailyData(safeClicks, approvedConvs, 14);

  // Recent rows (latest 20)
  const recentClicks = safeClicks.slice(0, 20).map(c => ({
    clickid:    c.id,
    device:     c.device,
    country:    c.country,
    network:    c.network,
    offer:      c.offer,
    ai_score:   c.ai_score,
    fraud_flag: c.fraud_flag,
    created_at: c.created_at,
  }));
  const recentConversions = safeConvs.slice(0, 20).map(c => ({
    offer_name: c.offer_name,
    network:    c.network,
    payout:     c.payout,
    revenue:    c.revenue,
    status:     c.status,
    created_at: c.created_at,
  }));

  return corsResponse(200, {
    range,
    summary: {
      total_clicks:       totalClicks,
      clean_clicks:       cleanClicks,
      fraud_clicks:       fraudClicks,
      total_conversions:  totalConversions,
      total_revenue:      +totalRevenue.toFixed(4),
      total_payout:       +totalPayout.toFixed(4),
      cvr:                +cvr.toFixed(2),
      epc:                +epc.toFixed(4),
      avg_ai_score:       +avgAiScore.toFixed(1),
    },
    device_breakdown:  deviceMap,
    country_breakdown: topCountries,
    network_breakdown: networkMap,
    daily_chart:       dailyData,
    recent_clicks:     recentClicks,
    recent_conversions: recentConversions,
  });
};

function rangeToDate(range) {
  const now = new Date();
  if (range === 'all') return null;
  const days = range === '1d' ? 1 : range === '30d' ? 30 : 7;
  now.setDate(now.getDate() - days);
  return now.toISOString();
}

function buildDailyData(clicks, conversions, days) {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayClicks = clicks.filter(c => c.created_at?.slice(0, 10) === dateStr).length;
    const dayConvs  = conversions.filter(c => c.created_at?.slice(0, 10) === dateStr).length;
    const dayRev    = conversions
      .filter(c => c.created_at?.slice(0, 10) === dateStr)
      .reduce((s, c) => s + (Number(c.revenue) || 0), 0);
    result.push({ date: dateStr, clicks: dayClicks, conversions: dayConvs, revenue: +dayRev.toFixed(2) });
  }
  return result;
}
