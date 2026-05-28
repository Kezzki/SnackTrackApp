import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge', // Using Edge runtime for speed
};

export default async function handler(req: Request) {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const store_id = url.searchParams.get('store_id');

  if (!store_id) {
    return new Response(JSON.stringify({ error: 'Missing store_id query parameter' }), { status: 400 });
  }

  try {
    // 1. Authenticate the User
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }), { status: 401 });
    }

    // Grab Supabase URLs from Vercel Environment Variables (with hardcoded fallbacks)
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ddjfrorucotaxtdxppmm.supabase.co';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkamZyb3J1Y290YXh0ZHhwcG1tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjEyODk5MywiZXhwIjoyMDg3NzA0OTkzfQ.3C17ApvGkQtKgkhwzCLYu8yBaNEqpToBq6cI2J_m2lo';
    
    if (!supabaseUrl || !supabaseKey) {
        console.error("Supabase ENV vars missing on Vercel");
        return new Response(JSON.stringify({ error: 'Server misconfiguration: missing Supabase credentials' }), { status: 500 });
    }

    // Verify token validity with Supabase
    const supabase = createClient(supabaseUrl, supabaseKey);
    const splitHeader = authHeader.split(' ');
    const token = splitHeader.length > 1 ? splitHeader[1] : authHeader;

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), { status: 401 });
    }

    // OPTIONAL: Check if the user is authorized to view this store's Data.
    // For now, we proceed as long as they are a valid logged-in user.

    // 2. Call the deployed Python API securely (with fallback)
    const primaryUrl = process.env.PYTHON_API_URL || 'http://game-1.sapphire-cloud.org:25612';
    const fallbackUrl = process.env.PYTHON_API_URL_FALLBACK || 'http://botspark.de1.octavia.id:25652';
    const backends = [primaryUrl, fallbackUrl];
    
    // We are passing an optional server-to-server secret just in case you ever want to lock down your python api!
    const pythonSecret = process.env.PYTHON_API_SECRET || '';

    let pythonResponse: Response | null = null;
    let lastError: string = '';

    for (const backendUrl of backends) {
      try {
        console.log(`[Forecast] Trying backend: ${backendUrl}`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

        const resp = await fetch(`${backendUrl}/api/forecast/${store_id}`, {
          method: "GET",
          headers: {
            'x-api-secret': pythonSecret,
            'Content-Type': 'application/json'
          },
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (resp.ok) {
          pythonResponse = resp;
          console.log(`[Forecast] Success from: ${backendUrl}`);
          break;
        } else {
          lastError = await resp.text();
          console.warn(`[Forecast] Backend ${backendUrl} returned ${resp.status}: ${lastError}`);
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
        console.warn(`[Forecast] Backend ${backendUrl} failed: ${lastError}`);
      }
    }

    if (!pythonResponse) {
      console.error("All Python backends failed:", lastError);
      return new Response(
        JSON.stringify({ error: `All backends unavailable: ${lastError}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Return ML predictions seamlessly to React frontend
    const mlData = await pythonResponse.json();
    return new Response(JSON.stringify(mlData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("Serverless Function Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' }});
  }
}
