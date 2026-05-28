import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }),
        { status: 401 }
      );
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ddjfrorucotaxtdxppmm.supabase.co';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: 'Server misconfiguration: missing Supabase credentials' }),
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const splitHeader = authHeader.split(' ');
    const token = splitHeader.length > 1 ? splitHeader[1] : authHeader;

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token' }),
        { status: 401 }
      );
    }

    // Parse body to determine action
    const body = await req.text();
    const parsed = JSON.parse(body);

    // Detect refund requests by URL path or explicit action field
    const requestUrl = new URL(req.url);
    const isRefundPath = requestUrl.pathname.endsWith('/refund');
    const action = parsed.action || 'create-transaction';

    // Route to appropriate Python endpoint
    let pythonEndpoint: string;
    if (isRefundPath || action === 'refund') {
      pythonEndpoint = '/api/payment/refund';
    } else if (action === 'create-transaction') {
      pythonEndpoint = '/api/payment/create-transaction';
    } else if (action === 'check-status') {
      pythonEndpoint = '/api/payment/check-status';
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown payment action: ${action}` }),
        { status: 400 }
      );
    }

    const primaryUrl = process.env.PYTHON_API_URL || 'http://game-1.sapphire-cloud.org:25612';
    const fallbackUrl = process.env.PYTHON_API_URL_FALLBACK || 'http://botspark.de1.octavia.id:25652';
    const backends = [primaryUrl, fallbackUrl];
    const pythonSecret = process.env.PYTHON_API_SECRET || '';

    let pythonResponse: Response | null = null;
    let lastError: string = '';

    for (const backendUrl of backends) {
      try {
        console.log(`[Payment] Trying backend: ${backendUrl}`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

        const resp = await fetch(`${backendUrl}${pythonEndpoint}`, {
          method: 'POST',
          headers: {
            'x-api-secret': process.env.INTERNAL_API_SECRET ?? "",
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: body,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (resp.ok) {
          pythonResponse = resp;
          console.log(`[Payment] Success from: ${backendUrl}`);
          break;
        } else {
          lastError = await resp.text();
          console.warn(`[Payment] Backend ${backendUrl} returned ${resp.status}: ${lastError}`);
          // For 4xx client errors, don't retry — the request itself is bad
          if (resp.status >= 400 && resp.status < 500) {
            return new Response(lastError, {
              status: resp.status,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }
      } catch (err: any) {
        lastError = err.message || 'Connection failed';
        console.warn(`[Payment] Backend ${backendUrl} failed: ${lastError}`);
      }
    }

    if (!pythonResponse) {
      console.error('All Python backends failed:', lastError);
      return new Response(
        JSON.stringify({ error: `All backends unavailable: ${lastError}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await pythonResponse.json();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Payment Proxy Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
