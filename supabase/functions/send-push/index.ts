
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://starbintangv2.pages.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;

webpush.setVapidDetails(
  "mailto:admin@starbintangv2.pages.dev",
  publicKey,
  privateKey,
);

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

  const secret = Deno.env.get("PUSH_TRIGGER_SECRET");
  if (!secret || req.headers.get("x-push-secret") !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const title = typeof body.title === "string"
      ? body.title.slice(0, 100)
      : "StarBintangV2";
    const message = typeof body.message === "string"
      ? body.message.slice(0, 180)
      : "Ada kenangan baru yang diunggah!";
    const url = "/";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, subscription");

    if (error) throw error;

    let sent = 0;
    let failed = 0;

    for (const item of subscriptions ?? []) {
      try {
        await webpush.sendNotification(
          item.subscription,
          JSON.stringify({ title, body: message, url }),
        );
        sent++;
      } catch (err) {
        failed++;
        const status = (err as { statusCode?: number }).statusCode;

        if (status === 404 || status === 410) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", item.id);
        }

        console.error("Push failed:", status);
      }
    }

    return json({ success: true, sent, failed });
  } catch (error) {
    console.error("Push error:", error);
    return json({ error: "Notification sending failed" }, 500);
  }
});
