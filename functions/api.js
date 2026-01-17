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
    // Handle GET requests (getUser)
    if (request.method === 'GET') {
      const action = url.searchParams.get('action');

      if (action === 'getUser') {
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
    }

    // Handle POST requests (createUser, verifyUser, updateVerification)
    if (request.method === 'POST') {
      const body = await request.json();
      const { action } = body;

      // Create or update user
      if (action === 'createUser') {
        const { name, birthday, email, phone, verification_code, code_created_at } = body;

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

      // Update verification code
      if (action === 'updateVerification') {
        const { email, verification_code, code_created_at } = body;

        const result = await env.DB.prepare(
          'UPDATE users SET verification_code = ?, code_created_at = ? WHERE email = ?'
        ).bind(verification_code, code_created_at, email.toLowerCase()).run();

        return new Response(JSON.stringify({ success: true, result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Verify user
      if (action === 'verifyUser') {
        const { email, code } = body;

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
    }

    return new Response(JSON.stringify({ error: 'Invalid action or method' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}