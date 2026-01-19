import { Resend } from 'resend';

export async function onRequest({ request, env }) {
  if (!env.RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 500 });
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const url = new URL(request.url);

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    /* =====================================================
       GET REQUESTS
    ===================================================== */
    if (request.method === 'GET') {
      const action = url.searchParams.get('action');

      if (action === 'getUser') {
        const email = url.searchParams.get('email');
        if (!email) return jsonError('Email parameter required', 400);

        const user = await env.DB
          .prepare('SELECT * FROM users WHERE email = ?')
          .bind(email.toLowerCase())
          .first();

        return json({ user });
      }

      if (action === 'getOrders') {
        const email = url.searchParams.get('email');
        if (!email) return jsonError('Email parameter required', 400);

        const { results } = await env.DB
          .prepare('SELECT * FROM orders WHERE user_email = ? ORDER BY created_at DESC')
          .bind(email.toLowerCase())
          .all();

        const orders = results.map(o => ({
          ...o,
          items: JSON.parse(o.items),
        }));

        return json({ orders });
      }
    }

    /* =====================================================
       POST REQUESTS
    ===================================================== */
    if (request.method === 'POST') {
      const body = await request.json();
      const { action } = body;

      /* ---------- SEND VERIFICATION EMAIL ---------- */
      if (action === 'sendVerificationEmail') {
        const { email, code } = body;
        if (!email || !code) return jsonError('Email and code required', 400);

        await resend.emails.send({
          from: env.FROM_EMAIL,
          to: email,
          subject: 'Your Tamales de Danely verification code',
          html: `
            <h2>Verify your email</h2>
            <p>Your verification code is:</p>
            <h1 style="letter-spacing:4px">${code}</h1>
            <p>This code expires in 10 minutes.</p>
          `,
        });

        return json({ success: true });
      }

      /* ---------- SEND ORDER EMAILS ---------- */
      if (action === 'sendOrderEmails') {
        const { order } = body;
        if (!order || !order.email || !order.items) {
          return jsonError('Invalid order payload', 400);
        }

        const itemsHtml = order.items
          .map(i => `<li>${i.qty} dozen ${i.name} — $${i.total.toFixed(2)}</li>`)
          .join('');

        // Admin email
        await resend.emails.send({
          from: env.FROM_EMAIL,
          to: env.DANELY_EMAIL,
          subject: `New Tamales Order — ${order.name}`,
          html: `
            <h2>New Order</h2>
            <p><strong>Name:</strong> ${order.name}</p>
            <p><strong>Email:</strong> ${order.email}</p>
            <p><strong>Phone:</strong> ${order.phone || 'N/A'}</p>
            <ul>${itemsHtml}</ul>
            <h3>Total: $${order.grandTotal.toFixed(2)}</h3>
          `,
        });

        // Customer email
        await resend.emails.send({
          from: env.FROM_EMAIL,
          to: order.email,
          subject: 'Your Tamales Order Confirmation',
          html: `
            <h2>Thanks for your order, ${order.name}!</h2>
            <ul>${itemsHtml}</ul>
            <h3>Total Due: $${order.grandTotal.toFixed(2)}</h3>
            <p>Payment: Cash at pickup</p>
          `,
        });

        return json({ success: true });
      }

      /* ---------- CREATE / UPDATE USER ---------- */
      if (action === 'createUser') {
        const { name, birthday, email, phone, verification_code, code_created_at } = body;
        if (!name || !email) return jsonError('Name and email required', 400);

        const existing = await env.DB
          .prepare('SELECT * FROM users WHERE email = ?')
          .bind(email.toLowerCase())
          .first();

        if (existing) {
          await env.DB.prepare(
            'UPDATE users SET name=?, birthday=?, phone=?, verification_code=?, code_created_at=? WHERE email=?'
          ).bind(name, birthday, phone, verification_code, code_created_at, email.toLowerCase()).run();
        } else {
          await env.DB.prepare(
            'INSERT INTO users (name, birthday, email, phone, verification_code, code_created_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).bind(name, birthday, email.toLowerCase(), phone, verification_code, code_created_at, new Date().toISOString()).run();
        }

        return json({ success: true });
      }

      /* ---------- VERIFY USER ---------- */
      if (action === 'verifyUser') {
        const { email, code } = body;

        const user = await env.DB
          .prepare('SELECT * FROM users WHERE email=? AND verification_code=?')
          .bind(email.toLowerCase(), code)
          .first();

        if (!user) return jsonError('Invalid code', 400);

        await env.DB
          .prepare('UPDATE users SET verified=1 WHERE email=?')
          .bind(email.toLowerCase())
          .run();

        return json({ success: true, user });
      }

      /* ---------- CREATE ORDER ---------- */
      if (action === 'createOrder') {
        const { user_email, user_name, user_phone, items, grand_total, created_at } = body;
        if (!user_email || !items || !grand_total) {
          return jsonError('Missing order fields', 400);
        }

        const result = await env.DB.prepare(
          'INSERT INTO orders (user_email, user_name, user_phone, items, grand_total, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(
          user_email.toLowerCase(),
          user_name,
          user_phone,
          JSON.stringify(items),
          grand_total,
          created_at
        ).run();

        return json({ success: true, orderId: result.meta.last_row_id });
      }
    }

    /* =====================================================
       DELETE REQUESTS
    ===================================================== */
    if (request.method === 'DELETE') {
      const body = await request.json();
      const { action } = body;

      if (action === 'deleteOrder') {
        const { orderId, userEmail } = body;
        if (!orderId || !userEmail) return jsonError('Order ID and email required', 400);

        await env.DB
          .prepare('DELETE FROM orders WHERE id=? AND user_email=?')
          .bind(orderId, userEmail.toLowerCase())
          .run();

        return json({ success: true });
      }
    }

    return jsonError('Invalid action or method', 400);
  } catch (err) {
    console.error(err);
    return jsonError(err.message, 500);
  }

  /* ---------- helpers ---------- */
  function json(data) {
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  function jsonError(message, status) {
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
