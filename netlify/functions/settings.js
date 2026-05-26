const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const body = JSON.parse(event.body);

    const { error } = await supabase
      .from("settings")
      .upsert({
        user_id: body.user_id,
        bot_token: body.bot_token,
        chat_id: body.chat_id
      });

    if (error) {
      return {
        statusCode: 500,
        body: JSON.stringify(error)
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
