const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
  const params = event.queryStringParameters;
  
  // Dynamic extraction pattern across most global affiliate standards (Voluum, MaxBounty, ClickBank)
  const clickId = params.sid || params.clickid || params.subid;
  const payout = parseFloat(params.payout || 0);
  const statusParam = params.status || 'approved';

  if (!clickId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required tracking attribution click parameter token (sid/clickid)" }) };
  }

  try {
    // 1. Fetch matching source transaction record to guarantee multi-tenant owner linkage
    const { data: clickData, error: clickErr } = await supabase
      .from('clicks')
      .select('*')
      .eq('click_id', clickId)
      .single();

    if (clickErr || !clickData) {
      return { statusCode: 404, body: JSON.stringify({ error: "Transaction mapping resolution mismatch for click verification token." }) };
    }

    // Normalize incoming string validation models
    let conversionStatus = 'approved';
    if (['2', 'rejected', 'declined', 'trash'].includes(statusParam.toLowerCase())) {
      conversionStatus = 'rejected';
    } else if (['0', 'pending', 'hold'].includes(statusParam.toLowerCase())) {
      conversionStatus = 'pending';
    }

    // 2. Write Transaction Event Ledger Ledger entry update to accounting stack
    const { error: insertErr } = await supabase
      .from('conversions')
      .insert([{
        user_id: clickData.user_id,
        click_id: clickId,
        network: clickData.network,
        offer_name: clickData.offer_name,
        payout: conversionStatus === 'rejected' ? 0.00 : payout,
        status: conversionStatus
      }]);

    if (insertErr) throw insertErr;

    // 3. Realtime Enterprise Monitoring Pipeline updates via Telegram Push Infrastructure
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      const isFraudulentAlert = clickData.is_fraud ? '⚠️ *CONVERSION TIED TO MALICIOUS BOT TRAFFIC SCORE*' : '💰 *VALIDATED ACCOUNT TRANSACTION*';
      const telegramMessage = `🔥 **NET INCOME CONVERSION RECORDED**\n---------------------------------------\n**Campaign Asset:** ${clickData.offer_name}\n**Network Provider:** ${clickData.network}\n**Payout Collected:** $${payout.toFixed(2)}\n**Status State:** ${conversionStatus.toUpperCase()}\n**Attribution Token:** \`${clickId}\`\n\n${isFraudulentAlert}`;

      fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: telegramMessage,
          parse_mode: 'Markdown'
        })
      }).catch(() => {});
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: "success", transaction: clickId, state: conversionStatus })
    };

  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal programmatic ledger population mapping crash error" }) };
  }
};