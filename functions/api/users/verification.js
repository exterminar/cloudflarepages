export async function onRequestPut({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { email, verification_code, code_created_at } = await request.json();

    const result = await env.DB.prepare(
      'UPDATE users SET verification_code = ?, code_created_at = ? WHERE email = ?'
    ).bind(verification_code, code_created_at, email.toLowerCase()).run();

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}