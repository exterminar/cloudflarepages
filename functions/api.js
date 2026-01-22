// /functions/api.js
export async function onRequest({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Helper functions
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

  // Helper to send emails via Resend API
  async function sendEmail({ to, subject, html }) {
    if (!env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL || 'Tamales de Danely <onboarding@resend.dev>',
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API error: ${errorText}`);
    }

    return await response.json();
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);

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

      if (action === 'getInventory') {
        try {
          const { results } = await env.DB
              .prepare('SELECT * FROM inventory')
              .all();

          const inventory = {};
          results.forEach(row => {
            inventory[row.tamale_id] = row.remaining;
          });

          return json({ inventory });
        } catch (error) {
          console.error('Error getting inventory:', error);
          return json({ inventory: {} });
        }
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
        const { email, name, code } = body;
        if (!email || !code) return jsonError('Email and code required', 400);

        await sendEmail({
          to: email,
          subject: 'Verify Your Email - Tamales de Danely',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
                .header { background: linear-gradient(180deg, #FF9C1A, #FFA43B); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #FFF3E6; padding: 40px; border-radius: 0 0 8px 8px; }
                .code { font-size: 36px; font-weight: bold; color: #E65100; text-align: center; letter-spacing: 8px; padding: 20px; background: white; border-radius: 8px; margin: 20px 0; }
                .footer { text-align: center; margin-top: 20px; color: #8C5A2D; font-size: 14px; }
              </style>
            </head>
            <body>
              <div class="header">
                <h1 style="margin: 0;">🫔 Tamales de Danely</h1>
              </div>
              <div class="content">
                <p>Hola ${name || 'there'},</p>
                <p>Thank you for signing up! Please use the verification code below to complete your registration:</p>
                <div class="code">${code}</div>
                <p>This code will expire in 10 minutes.</p>
                <p>If you didn't request this code, please ignore this email.</p>
                <p>¡Gracias!<br>Danely</p>
              </div>
              <div class="footer">
                © 2025 Tamales de Danely. All rights reserved.
              </div>
            </body>
            </html>
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
          .map(i => `
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #eee;">${i.name}</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${i.qty} dozen</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${i.total.toFixed(2)}</td>
            </tr>
          `)
          .join('');

        // Send email to Danely (admin)
        await sendEmail({
          to: env.DANELY_EMAIL || 'danely@example.com',
          subject: `🫔 New Tamales Order from ${order.name}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
                .header { background: linear-gradient(180deg, #FF9C1A, #FFA43B); color: white; padding: 30px; text-align: center; }
                .content { background: #FFF3E6; padding: 30px; }
                table { width: 100%; border-collapse: collapse; background: white; margin: 20px 0; }
                th { background: #E65100; color: white; padding: 12px; text-align: left; }
                td { padding: 10px; border-bottom: 1px solid #eee; }
                .total { font-size: 20px; font-weight: bold; color: #E65100; margin-top: 20px; }
              </style>
            </head>
            <body>
              <div class="header">
                <h1 style="margin: 0;">🫔 New Tamale Order!</h1>
              </div>
              <div class="content">
                <h2>Customer Information</h2>
                <p><strong>Name:</strong> ${order.name}<br>
                <strong>Email:</strong> ${order.email}<br>
                <strong>Phone:</strong> ${order.phone || 'Not provided'}</p>
                
                <h2>Order Details</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th style="text-align: center;">Quantity</th>
                      <th style="text-align: right;">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemsHtml}
                  </tbody>
                </table>
                
                <div class="total">Total: $${order.grandTotal.toFixed(2)}</div>
                
                <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
              </div>
            </body>
            </html>
          `,
        });

        // Send confirmation email to customer
        await sendEmail({
          to: order.email,
          subject: '¡Order Confirmed! - Tamales de Danely',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
                .header { background: linear-gradient(180deg, #FF9C1A, #FFA43B); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #FFF3E6; padding: 30px; border-radius: 0 0 8px 8px; }
                table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; margin: 20px 0; }
                th { background: #E65100; color: white; padding: 12px; text-align: left; }
                td { padding: 10px; border-bottom: 1px solid #eee; }
                .total { font-size: 20px; font-weight: bold; color: #E65100; text-align: right; margin-top: 20px; }
                .footer { text-align: center; margin-top: 20px; color: #8C5A2D; font-size: 14px; }
              </style>
            </head>
            <body>
              <div class="header">
                <h1 style="margin: 0;">¡Gracias por tu orden!</h1>
              </div>
              <div class="content">
                <p>Hola ${order.name},</p>
                <p>We received your tamale order! Here are the details:</p>
                
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th style="text-align: center;">Quantity</th>
                      <th style="text-align: right;">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemsHtml}
                  </tbody>
                </table>
                
                <div class="total">Total: $${order.grandTotal.toFixed(2)}</div>
                
                <div style="margin-top: 30px; padding: 20px; background: white; border-radius: 8px;">
                  <p style="margin: 0 0 10px 0;"><strong>📍 Pickup Details:</strong></p>
                    <p style="margin: 5px 0;">📍 Danely's House<br>
                    💵 Cash only, please<br>
                    📅 Pickup on January 26th</p>
                </div>
                
                <p style="margin-top: 20px;">We'll contact you when your order is ready for pickup!</p>
                
                <p>¡Gracias!<br>Danely</p>
              </div>
              <div class="footer">
                © 2025 Tamales de Danely. All rights reserved.
              </div>
            </body>
            </html>
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
            'INSERT INTO users (name, birthday, email, phone, verification_code, code_created_at, created_at, verified) VALUES (?, ?, ?, ?, ?, ?, ?, 0)'
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

      // Update inventory
      for (const item of items) {
        await env.DB.prepare(
            'UPDATE inventory SET remaining = remaining - ? WHERE tamale_id = ?'
        ).bind(item.qty, item.id).run();
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
    console.error('API Error:', err);
    return jsonError(err.message, 500);
  }
}