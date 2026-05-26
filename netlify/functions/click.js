const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event, context) => {
  // Graceful handling for favicon or ping checks
  if (event.path.includes('favicon.ico')) return { statusCode: 204 };

  // Parse path or query strings to extract tracking slug
  const slug = event.queryStringParameters.slug || event.path.split('/').pop();
  if (!slug) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing campaign identifier tracking token" }) };
  }

  try {
    // 1. Fetch Dynamic Routing Parameters from Global Link manifest
    const { data: link, error: linkErr } = await supabase
      .from('links')
      .select('*')
      .eq('slug', slug)
      .single();

    if (linkErr || !link) {
      return { statusCode: 404, body: "Error 404: Tracking asset campaign destination unconfigured." };
    }

    // 2. Client Parameter Extraction and Parsing
    const ip = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || '127.0.0.1';
    const userAgent = event.headers['user-agent'] || 'Unknown-Agent';
    const country = event.headers['x-country'] || 'XX'; // Populated out-of-the-box by Netlify Geolocation Engine

    // Normalize Device / Browser contexts
    let device = 'Desktop';
    if (/mobile/i.test(userAgent)) device = 'Mobile';
    if (/tablet/i.test(userAgent)) device = 'Tablet';

    let browser = 'Other';
    if (/chrome|crios/i.test(userAgent)) browser = 'Chrome';
    else if (/firefox|fxios/i.test(userAgent)) browser = 'Firefox';
    else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'Safari';

    // 3. AI Traffic Scoring Engine & Algorithmic Fraud Profiling
    let score = 100;
    let isFraud = false;
    let fraudReason = [];

    // Rule A: Headless or Automated Engine Identification Profiling
    if (/bot|crawler|spider|headless|selenium|puppeteer/i.test(userAgent)) {
      score -= 60;
      fraudReason.push('Automated User-Agent / Crawler Fingerprint Signature');
    }
    // Rule B: Legacy Core Software Signatures
    if (userAgent === 'Unknown-Agent' || userAgent.length < 25) {
      score -= 30;
      fraudReason.push('Truncated / Non-Standard Malformed User-Agent string');
    }
    // Rule C: Geographical Verification checks 
    if (country === 'XX') {
      score -= 20;
      fraudReason.push('Unresolved geographic routing source coordinates');
    }

    if (score < 50) isFraud = true;
    const fraudLabel = isFraud ? '🛑 FRAUD / BOT DETECTED' : '✅ HIGH QUALITY TRAFFIC';

    // 4. Multi-Variant Dynamic Smart Routing Algorithm Strategy Execution
    let destinationUrl = link.default_destination_url;
    if (link.routing_rules && Array.isArray(link.routing_rules)) {
      for (const rule of link.routing_rules) {
        const matchesCountry = !rule.country || rule.country.toLowerCase() === country.toLowerCase();
        const matchesDevice = !rule.device || rule.device.toLowerCase() === device.toLowerCase();
        if (matchesCountry && matchesDevice) {
          destinationUrl = rule.url;
          break;
        }
      }
    }

    // 5. Generate Unique Tracker Key Token and append click lifecycle parameters
    const clickId = uuidv4();
    const cleanDestination = destinationUrl.replace('{clickid}', clickId).replace('{sid}', clickId);

    // 6. Asynchronous Background Write Logging Engine To Absorb Database Spikes Safely
    await supabase.from('clicks').insert([{
      user_id: link.user_id,
      link_id: link.id,
      click_id: clickId,
      slug: slug,
      network: link.network,
      offer_name: link.offer_name,
      ip_address: ip,
      country: country,
      browser: browser,
      device: device,
      traffic_score: score,
      is_fraud: isFraud,
      fraud_reason: fraudReason.join(' | ')
    }]);

    // 7. Telemetry Notification Execution Pipeline
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      const telegramMessage = `🖱️ **NEW TRAFFIC CLICK LOGGED**\n--------------------------\n**Campaign:** ${link.offer_name} [${link.network}]\n**Tracking Token:** \`${clickId}\`\n**Origin Context:** ${country} | ${device} | ${browser}\n**Score Metrics:** ${score}/100 (${fraudLabel})`;
      
      fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: telegramMessage,
          parse_mode: 'Markdown'
        })
      }).catch(() => {}); // Maintain application path safety if webhook falls down
    }

    // 8. Performance Redirection Response Formatter
    return {
      statusCode: 302,
      headers: {
        'Location': cleanDestination,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      },
      body: ''
    };

  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: "Critical execution pipeline parsing failure encountered." };
  }
};