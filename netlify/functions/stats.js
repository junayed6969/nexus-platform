const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
  // Enforce CORS Pre-flight checks across client frameworks
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } };
  }

  // Token Authenticator Parsing layer
  const authHeader = event.headers.authorization;
  if (!authHeader) return { statusCode: 401, body: "Unauthorized API execution layer boundary request" };
  
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return { statusCode: 403, body: "Session lifecycle expired verification tracking context error" };

  try {
    // Collect all data chunks scoped precisely to the identity key token via explicit tenant matching constraints
    const [clicksRes, convRes] = await Promise.all([
      supabase.from('clicks').select('*').eq('user_id', user.id),
      supabase.from('conversions').select('*').eq('user_id', user.id).eq('status', 'approved')
    ]);

    const clicks = clicksRes.data || [];
    const conversions = convRes.data || [];

    const totalClicks = clicks.length;
    const totalConversions = conversions.length;
    
    // Financial compilation calculations using precise float accumulation paradigms
    const totalRevenue = conversions.reduce((sum, item) => sum + parseFloat(item.payout || 0), 0);
    const cr = totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(2) : "0.00";
    const epc = totalClicks > 0 ? (totalRevenue / totalClicks).toFixed(4) : "0.0000";

    // Build historical trend datasets
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        metrics: { totalClicks, totalConversions, totalRevenue: totalRevenue.toFixed(2), cr, epc },
        rawClicks: clicks.slice(0, 15), // Stream newest metrics to list views 
        rawConversions: conversions.slice(0, 15)
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};