export async function onRequestPost({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { email, code } = await request.json();

    const user = await env.DB.prepare(
      'SELECT * FROM users WHERE email = ? AND verification_code = ?'
    ).bind(email.toLowerCase(), code).first();

    if (user) {
      // Mark as verified
      await env.DB.prepare(
        'UPDATE users SET verified = 1 WHERE email = ?'
      ).bind(email.toLowerCase()).run();

      return new Response(JSON.stringify({ success: true, user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ success: false, error: 'Invalid code' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}