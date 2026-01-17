export async function onRequestPost({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { name, birthday, email, phone, verification_code, code_created_at } = await request.json();

    if (!name || !email) {
      return new Response(JSON.stringify({ error: 'Name and email are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if user exists
    const existingUser = await env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first();

    let result;
    if (existingUser) {
      // Update existing user
      result = await env.DB.prepare(
        'UPDATE users SET name = ?, birthday = ?, phone = ?, verification_code = ?, code_created_at = ? WHERE email = ?'
      ).bind(name, birthday, phone, verification_code, code_created_at, email.toLowerCase()).run();
    } else {
      // Insert new user
      result = await env.DB.prepare(
        'INSERT INTO users (name, birthday, email, phone, verification_code, code_created_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(name, birthday, email.toLowerCase(), phone, verification_code, code_created_at, new Date().toISOString()).run();
    }

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

export async function onRequestGet({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const url = new URL(request.url);
    const email = url.searchParams.get('email');

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email parameter required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const user = await env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first();

    return new Response(JSON.stringify({ user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}