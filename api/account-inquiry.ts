import { createClient } from "@supabase/supabase-js";

export const config = {
    runtime: "edge",
};

export default async function handler(req: Request) {
    if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
        return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl =
        process.env.VITE_SUPABASE_URL ||
        "https://ddjfrorucotaxtdxppmm.supabase.co";
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || "";

    const supabase = createClient(supabaseUrl, supabaseKey);
    const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader;

    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
        return json({ error: "Unauthorized" }, 401);
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    let account_bank: string;
    let account_number: string;

    try {
        const body = await req.json();
        account_bank = body.account_bank;
        account_number = body.account_number;
    } catch {
        return json({ error: "Invalid JSON body" }, 400);
    }

    if (!account_bank || !account_number) {
        return json({ error: "account_bank and account_number are required" }, 400);
    }

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!rapidApiKey) {
        return json({ error: "RAPIDAPI_KEY not configured on server" }, 500);
    }

    // ── Proxy to RapidAPI (cek-nomor-rekening-bank) ───────────────────────────
    // Pattern: GET /check_bank_lq/{bank_code}/{account_number}
    try {
        const upstream = await fetch(
            `https://cek-nomor-rekening-bank.p.rapidapi.com/check_bank_lq/${encodeURIComponent(account_bank)}/${encodeURIComponent(account_number)}`,
            {
                method: "GET",
                headers: {
                    "x-rapidapi-key": rapidApiKey,
                    "x-rapidapi-host": "cek-nomor-rekening-bank.p.rapidapi.com",
                },
            }
        );

        const data = await upstream.json();
        return json(data, upstream.status);
    } catch (err) {
        console.error("account-inquiry upstream error:", err);
        return json({ error: "Upstream request failed" }, 502);
    }
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}
