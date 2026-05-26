// netlify/functions/_utils.js
// Shared utilities for all Netlify Functions

import { createClient } from '@supabase/supabase-js';

// ─── Supabase Admin Client (service_role bypasses RLS) ───────────────────────
export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, {
    auth: { persistSession: false }
  });
}

// ─── CORS headers ─────────────────────────────────────────────────────────────
export const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function corsResponse(statusCode, body, extra = {}) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extra },
    body: JSON.stringify(body),
  };
}

// ─── Generate unique clickid ──────────────────────────────────────────────────
export function generateClickId() {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CK-${ts}-${rand}`;
}

// ─── Parse device type from UA ────────────────────────────────────────────────
export function parseDevice(ua = '') {
  const s = ua.toLowerCase();
  if (/mobile|android|iphone|ipod|blackberry|windows phone/.test(s)) return 'mobile';
  if (/tablet|ipad/.test(s)) return 'tablet';
  return 'desktop';
}

// ─── Basic AI Scoring + Fraud Detection ───────────────────────────────────────
export function scoreTraffic(ua = '', ip = '', referer = '') {
  let score = 100;
  let fraud = false;
  const u = ua.toLowerCase();

  const botKeywords = [
    'bot','spider','crawl','slurp','mediapartners','adsbot','facebookexternalhit',
    'twitterbot','linkedinbot','whatsapp','semrush','ahrefs','mj12','dotbot',
    'python','curl','wget','postman','insomnia','scrapy','httpclient','java/'
  ];
  for (const kw of botKeywords) {
    if (u.includes(kw)) { score -= 80; fraud = true; break; }
  }

  if (!ua || ua.length < 20)        { score -= 40; fraud = true; }
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip)) score -= 20;
  if (ip === '127.0.0.1' || ip === '::1') { score -= 60; fraud = true; }
  if (!referer) score -= 5;

  const suspiciousUA = ['headless','phantom','selenium','webdriver','puppeteer','playwright'];
  for (const s of suspiciousUA) {
    if (u.includes(s)) { score -= 80; fraud = true; break; }
  }

  score = Math.max(0, Math.min(100, score));
  if (score < 20) fraud = true;
  return { ai_score: score, fraud_flag: fraud };
}

// ─── GEO lookup (free ip-api.com) ─────────────────────────────────────────────
export async function getGeo(ip) {
  try {
    if (!ip || ip === '127.0.0.1' || ip === '::1') return { country: 'LOCAL', language: 'en' };
    const res  = await fetch(`http://ip-api.com/json/${ip}?fields=country,countryCode,lang`);
    const data = await res.json();
    return { country: data.countryCode || 'XX', language: data.lang || 'en' };
  } catch {
    return { country: 'XX', language: 'en' };
  }
}

// ─── Telegram notification ────────────────────────────────────────────────────
export async function sendTelegram(botToken, chatId, message) {
  if (!botToken || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id:    chatId,
        text:       message,
        parse_mode: 'HTML',
      }),
    });
  } catch (e) {
    console.error('Telegram error:', e.message);
  }
}

// ─── Get user Telegram settings ──────────────────────────────────────────────
export async function getTelegramSettings(supabase, userId) {
  const { data } = await supabase
    .from('user_settings')
    .select('telegram_bot_token,telegram_chat_id,notify_clicks,notify_conversions,notify_fraud')
    .eq('user_id', userId)
    .single();
  return data || {};
}

// ─── Auth: verify JWT from Authorization header ────────────────────────────────
export async function verifyUser(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return null;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}
