const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const slug = event.queryStringParameters.slug;

    const { data, error } = await supabase
      .from("links")
      .select("*")
      .eq("slug", slug)
      .single();

    if (error || !data) {
      return { statusCode: 404, body: "Not found" };
    }

    return {
      statusCode: 302,
      headers: {
        Location: data.destination_url
      }
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: err.message
    };
  }
};
