import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // 1. Verify auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: 'Server misconfiguration' }, 500);
    }

    // Service-role client — bypasses RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized: Invalid token' }, 401);
    }

    // 2. Verify admin role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin');

    if (!roles || roles.length === 0) {
      return jsonResponse({ error: 'Forbidden: Admin access required' }, 403);
    }

    // 3. Parse request
    const body = await req.json();
    const action = body.action || '';

    if (action === 'clear-items') {
      return await handleClearItems(supabase, body.user_id);
    } else if (action === 'clear-transactions') {
      return await handleClearTransactions(supabase, body.user_id, body.role);
    } else if (action === 'login-as-user') {
      return await handleLoginAsUser(supabase, body.user_email, body.redirect_to);
    } else {
      return jsonResponse({ error: `Unknown admin action: ${action}` }, 400);
    }

  } catch (error: any) {
    console.error('Admin API Error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
}

// ---------------------------------------------------------------------------
// Clear Items: deactivate products, cancel ongoing orders, refund paid ones
// ---------------------------------------------------------------------------
async function handleClearItems(supabase: any, userId: string) {
  if (!userId) return jsonResponse({ detail: 'user_id is required' }, 400);

  // 1. Find user's stores
  const { data: stores, error: storeErr } = await supabase
    .from('stores').select('id').eq('seller_id', userId);
  if (storeErr) throw storeErr;
  if (!stores?.length) return jsonResponse({ detail: 'Pengguna tidak memiliki toko' }, 404);

  let cancelledCount = 0;
  let refundCount = 0;
  let productCount = 0;

  for (const store of stores) {
    const storeId = store.id;

    // 2. Find ongoing orders
    const { data: orders } = await supabase
      .from('orders')
      .select('id, buyer_id, total_amount')
      .eq('store_id', storeId)
      .in('status', ['pending', 'menunggu', 'diproses']);

    for (const order of (orders || [])) {
      const orderId = order.id;
      const buyerId = order.buyer_id;

      // Check payment
      const { data: txRows } = await supabase
        .from('transactions')
        .select('payment_status, amount')
        .eq('order_id', orderId);

      const tx = txRows?.[0] ?? null;
      const isPaid = tx?.payment_status === 'paid';

      if (isPaid) {
        // Create refund request
        await supabase.from('refund_requests').insert({
          order_id: orderId,
          buyer_id: buyerId,
          reason: 'Admin: Pembersihan item toko',
          status: 'pending_manual',
          refund_amount: tx.amount || order.total_amount,
        });

        // Mark transaction refunded
        await supabase.from('transactions')
          .update({ payment_status: 'refunded' })
          .eq('order_id', orderId);

        refundCount++;
      }

      // Cancel order
      await supabase.from('orders')
        .update({ status: 'dibatalkan', updated_at: new Date().toISOString() })
        .eq('id', orderId);
      cancelledCount++;

      // Notify buyer
      const msg = `Pesanan Anda dibatalkan oleh admin.${isPaid ? ' Refund sedang diproses.' : ''}`;
      await supabase.from('notifications').insert({
        user_id: buyerId,
        title: 'Pesanan Dibatalkan',
        message: msg,
        type: 'order',
        order_id: orderId,
      });
    }

    // 3. Clean up cart items + deactivate products
    const { data: products } = await supabase
      .from('products').select('id').eq('store_id', storeId);
    const productIds = (products || []).map((p: any) => p.id);
    productCount += productIds.length;

    if (productIds.length) {
      await supabase.from('cart_items').delete().in('product_id', productIds);
      await supabase.from('products')
        .update({ is_active: false, stock: 0 })
        .eq('store_id', storeId);
    }
  }

  return jsonResponse({
    success: true,
    products_deactivated: productCount,
    orders_cancelled: cancelledCount,
    refunds_created: refundCount,
  });
}

// ---------------------------------------------------------------------------
// Clear Transactions: cascade-delete orders + all dependent records
// Both /transaksi and /orders pages are driven by the `orders` table,
// so we must delete orders (and their FK dependents) to clear the UI.
// ---------------------------------------------------------------------------
async function handleClearTransactions(supabase: any, userId: string, role: string) {
  if (!userId) return jsonResponse({ detail: 'user_id is required' }, 400);
  if (role !== 'buyer' && role !== 'seller') {
    return jsonResponse({ detail: "role must be 'buyer' or 'seller'" }, 400);
  }

  // 1. Find all order IDs for this user
  let orderIds: string[] = [];

  if (role === 'buyer') {
    const { data: orders } = await supabase
      .from('orders').select('id').eq('buyer_id', userId);
    orderIds = (orders || []).map((o: any) => o.id);
  } else {
    // Seller: find orders via their store(s)
    const { data: stores } = await supabase
      .from('stores').select('id').eq('seller_id', userId);
    if (stores?.length) {
      const storeIds = stores.map((s: any) => s.id);
      const { data: orders } = await supabase
        .from('orders').select('id').in('store_id', storeIds);
      orderIds = (orders || []).map((o: any) => o.id);
    }
  }

  if (orderIds.length === 0) {
    return jsonResponse({ success: true, orders_deleted: 0, message: 'Tidak ada pesanan ditemukan' });
  }

  // 2. Cascade-delete all dependent records (order by FK depth)
  // Tables that reference orders.id:
  //   - order_items (order_id)
  //   - transactions (order_id)
  //   - notifications (order_id, nullable)
  //   - refund_requests (order_id)
  //   - reviews (order_id)
  //   - seller_balance_transactions (order_id)

  // Process in batches if too many (Supabase .in() has limits)
  const batchSize = 100;
  for (let i = 0; i < orderIds.length; i += batchSize) {
    const batch = orderIds.slice(i, i + batchSize);

    await Promise.all([
      supabase.from('order_items').delete().in('order_id', batch),
      supabase.from('transactions').delete().in('order_id', batch),
      supabase.from('notifications').delete().in('order_id', batch),
      supabase.from('refund_requests').delete().in('order_id', batch),
      supabase.from('reviews').delete().in('order_id', batch),
      supabase.from('seller_balance_transactions').delete().in('order_id', batch),
    ]);

    // Now safe to delete the orders themselves
    await supabase.from('orders').delete().in('id', batch);
  }

  // 3. Also clean up seller balance transactions not tied to orders
  if (role === 'seller') {
    await supabase.from('seller_balance_transactions').delete().eq('seller_id', userId);
  }

  return jsonResponse({
    success: true,
    orders_deleted: orderIds.length,
  });
}

// ---------------------------------------------------------------------------
// Login as User: generate a magic link for the target user
// ---------------------------------------------------------------------------
async function handleLoginAsUser(supabase: any, userEmail: string, redirectTo?: string) {
  if (!userEmail) return jsonResponse({ detail: 'user_email is required' }, 400);

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: userEmail,
    options: {
      redirectTo: redirectTo || undefined,
    },
  });

  if (error) throw error;

  return jsonResponse({ action_link: data?.properties?.action_link });
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
