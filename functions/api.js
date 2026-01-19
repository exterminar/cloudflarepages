import { Resend } from 'resend';

// Cloudflare Pages Function for handling API requests
// This file handles all database operations for users and orders
export async function onRequest({ request, env }) {
  const resend = new Resend(env.RESEND_API_KEY);

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
    // Handle GET requests (retrieving data)
    if (request.method === 'GET') {
      const action = url.searchParams.get('action');

      // Get user by email from database
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

      // Get all orders for a specific user from database
      if (action === 'getOrders') {
        const email = url.searchParams.get('email');

        if (!email) {
          return new Response(JSON.stringify({ error: 'Email parameter required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { results } = await env.DB.prepare(
          'SELECT * FROM orders WHERE user_email = ? ORDER BY created_at DESC'
        ).bind(email.toLowerCase()).all();

        // Parse items JSON for each order (items are stored as JSON string in DB)
        const orders = results.map(order => ({
          ...order,
          items: JSON.parse(order.items)
        }));

        return new Response(JSON.stringify({ orders }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Handle POST requests (creating/updating data)
    if (request.method === 'POST') {
      if (action === 'sendVerificationEmail') {
        const { email, code } = body;

        if (!email || !code) {
          return new Response(JSON.stringify({ error: 'Email and code required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        await resend.emails.send({
          from: env.FROM_EMAIL,
          to: email,
          subject: 'Your Tamales de Danely verification code',
          html: `
            <h2>Verify your email</h2>
            <p>Your verification code is:</p>
            <h1 style="letter-spacing:4px">${code}</h1>
            <p>This code expires in 10 minutes.</p>
          `
        });

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (action === 'sendOrderEmails') {
        const { order } = body;

        if (!order || !order.email || !order.items) {
          return new Response(JSON.stringify({ error: 'Invalid order payload' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const itemsHtml = order.items.map(item =>
          `<li>${item.qty} dozen ${item.name} — $${item.total.toFixed(2)}</li>`
        ).join('');

        // Email to Danely
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
          `
        });

        // Confirmation to customer
        await resend.emails.send({
          from: env.FROM_EMAIL,
          to: order.email,
          subject: 'Your Tamales Order Confirmation',
          html: `
            <h2>Thanks for your order, ${order.name}!</h2>
            <ul>${itemsHtml}</ul>
            <h3>Total Due: $${order.grandTotal.toFixed(2)}</h3>
            <p>Payment: Cash at pickup</p>
          `
        });

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const body = await request.json();
      const { action } = body;

      // Create new user or update existing user in database
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
      }

      // Update verification code for existing user
      if (action === 'updateVerification') {
        const { email, verification_code, code_created_at } = body;

        const result = await env.DB.prepare(
          'UPDATE users SET verification_code = ?, code_created_at = ? WHERE email = ?'
        ).bind(verification_code, code_created_at, email.toLowerCase()).run();

        return new Response(JSON.stringify({ success: true, result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Verify user with verification code and mark as verified
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

      // Create new order and save to database
      if (action === 'createOrder') {
        const { user_email, user_name, user_phone, items, grand_total, created_at } = body;

        if (!user_email || !items || !grand_total) {
          return new Response(JSON.stringify({ error: 'Missing required order fields' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const result = await env.DB.prepare(
          'INSERT INTO orders (user_email, user_name, user_phone, items, grand_total, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(
          user_email.toLowerCase(),
          user_name,
          user_phone,
          JSON.stringify(items), // Store items array as JSON string
          grand_total,
          created_at
        ).run();

        return new Response(JSON.stringify({ success: true, orderId: result.meta.last_row_id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Handle DELETE requests (deleting data)
    if (request.method === 'DELETE') {
      const body = await request.json();
      const { action } = body;

      // Delete specific order from database
      if (action === 'deleteOrder') {
        const { orderId, userEmail } = body;

        if (!orderId || !userEmail) {
          return new Response(JSON.stringify({ error: 'Order ID and user email required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Verify order belongs to user before deleting (security check)
        const order = await env.DB.prepare(
          'SELECT * FROM orders WHERE id = ? AND user_email = ?'
        ).bind(orderId, userEmail.toLowerCase()).first();

        if (!order) {
          return new Response(JSON.stringify({ error: 'Order not found or unauthorized' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const result = await env.DB.prepare(
          'DELETE FROM orders WHERE id = ? AND user_email = ?'
        ).bind(orderId, userEmail.toLowerCase()).run();

        return new Response(JSON.stringify({ success: true, result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
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