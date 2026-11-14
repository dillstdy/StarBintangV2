import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://starbintangv2.pages.dev",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");

    if (!token || token === authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(url, anonKey);
    const { data: authData, error: authError } =
      await authClient.auth.getUser(token);

    if (authError || !authData.user) {
      return json({ error: "Invalid session" }, 401);
    }

    if (authData.user.is_anonymous !== true) {
      return json({ error: "Anonymous session required" }, 403);
    }

    const body = await req.json();

    if (!body || typeof body !== "object") {
      return json({ error: "Invalid request body" }, 400);
    }

    const { device_id, subscription, installed, display_mode } = body;

    if (
      typeof device_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(device_id)
    ) {
      return json({ error: "Invalid device ID" }, 400);
    }

    // Subscription hanya wajib jika perangkat mendaftar notifikasi.
    if (
      subscription != null &&
      (
        typeof subscription.endpoint !== "string" ||
        !subscription.endpoint.startsWith("https://") ||
        typeof subscription.keys?.p256dh !== "string" ||
        typeof subscription.keys?.auth !== "string"
      )
    ) {
      return json({ error: "Invalid subscription data" }, 400);
    }

    const admin = createClient(url, serviceKey);
    const now = new Date().toISOString();

    // Simpan statistik perangkat.
    const { error: deviceError } = await admin
      .from("pwa_devices")
      .upsert({
        device_id,
        installed: installed === true,
        display_mode:
          typeof display_mode === "string"
            ? display_mode.slice(0, 30)
            : "browser",
        last_seen: now,
      }, { onConflict: "device_id" });

    if (deviceError) throw deviceError;

    // Simpan subscription hanya jika tersedia.
    if (subscription) {
      const { error: pushError } = await admin
        .from("push_subscriptions")
        .upsert({
          device_id,
          endpoint: subscription.endpoint,
          subscription,
          updated_at: now,
        }, { onConflict: "endpoint" });

      if (pushError) throw pushError;
    }

    return json({
      success: true,
      device_saved: true,
      subscription_saved: Boolean(subscription),
    });
  } catch (error) {
    console.error("Save subscription error:", error);
    return json({ error: "Could not save device data" }, 500);
  }
});