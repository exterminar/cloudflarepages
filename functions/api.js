export async function onRequest({ request, env }) {
  const url = new URL(request.url);

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Route: Create or update user
    if (url.pathname === '/api/users' && request.method === 'POST') {
      const { name, birthday, email, phone, verification_code, code_created_at } = await request.json();

      if (!name || !email) {
        return new Response(JSON.stringify({ error: 'Name and email are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const existingUser = await env.DB.prepare(
        'SELECT * FROM users WHERE email = ?'
      ).bind(email.toLowerCase()).first();

      let result;
      if (existingUser) {
        result = await env.DB.prepare(
          'UPDATE users SET name = ?, birthday = ?, phone = ?, verification_code = ?, code_created_at = ? WHERE email = ?'
        ).bind(name, birthday, phone, verification_code, code_created_at, email.toLowerCase()).run();
      } else {
        result = await env.DB.prepare(
          'INSERT INTO users (name, birthday, email, phone, verification_code, code_created_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(name, birthday, email.toLowerCase(), phone, verification_code, code_created_at, new Date().toISOString()).run();
      }

      return new Response(JSON.stringify({ success: true, result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Route: Get user by email
    if (url.pathname === '/api/users' && request.method === 'GET') {
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
    }

    // Route: Update verification code
    if (url.pathname === '/api/users/verification' && request.method === 'PUT') {
      const { email, verification_code, code_created_at } = await request.json();

      const result = await env.DB.prepare(
        'UPDATE users SET verification_code = ?, code_created_at = ? WHERE email = ?'
      ).bind(verification_code, code_created_at, email.toLowerCase()).run();

      return new Response(JSON.stringify({ success: true, result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Route: Verify user
    if (url.pathname === '/api/users/verify' && request.method === 'POST') {
      const { email, code } = await request.json();

      const user = await env.DB.prepare(
        'SELECT * FROM users WHERE email = ? AND verification_code = ?'
      ).bind(email.toLowerCase(), code).first();

      if (user) {
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
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
