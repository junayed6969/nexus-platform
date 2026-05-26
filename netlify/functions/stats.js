const { createClient } = require("@supabase/supabase-js");

exports.handler = async () => {
  try {

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const { data: clicks, error: cErr } = await supabase
      .from("clicks")
      .select("*");

    const { data: conv, error: vErr } = await supabase
      .from("conversions")
      .select("*");

    if (cErr || vErr) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: cErr || vErr
        })
      };
    }

    let revenue = 0;
    (conv || []).forEach(c => {
      revenue += Number(c.payout || 0);
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        clicks: clicks?.length || 0,
        conversions: conv?.length || 0,
        revenue
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message
      })
    };
  }
};
