// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SVC_ROLE_KEY")!;

// ---------------------------------------------------------------------------
// Stripe webhook signature verification (HMAC-SHA256)
// Stripe signs with: "t=<timestamp>,v1=<sig>"
// ---------------------------------------------------------------------------
async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
): Promise<void> {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const timestamp = parts["t"];
  const expectedSig = parts["v1"];

  if (!timestamp || !expectedSig) throw new Error("Malformed Stripe-Signature header");

  const tolerance = 300; // 5 minutes
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > tolerance) {
    throw new Error("Stripe webhook timestamp too old");
  }

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (computed !== expectedSig) throw new Error("Stripe signature mismatch");
}

// ---------------------------------------------------------------------------
// Retrieve the Supabase user_id from a Stripe customer's metadata
// ---------------------------------------------------------------------------
async function getUserIdFromCustomer(customerId: string): Promise<string | null> {
  const res = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
    headers: { "Authorization": `Bearer ${STRIPE_SECRET_KEY}` },
  });
  if (!res.ok) return null;
  const customer = await res.json();
  return customer?.metadata?.supabase_user_id ?? null;
}

// ---------------------------------------------------------------------------
// Upsert a row in the subscriptions table
// ---------------------------------------------------------------------------
async function upsertSubscription(data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upsert failed: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const sigHeader = req.headers.get("stripe-signature");
  if (!sigHeader) {
    return new Response(JSON.stringify({ error: "Missing Stripe-Signature header" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();

  try {
    await verifyStripeSignature(rawBody, sigHeader, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Signature verification failed:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const customerId = session["customer"] as string;
        const subscriptionId = session["subscription"] as string;

        const userId = await getUserIdFromCustomer(customerId);
        if (!userId) {
          console.error("No supabase_user_id on Stripe customer", customerId);
          break;
        }

        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
          headers: { "Authorization": `Bearer ${STRIPE_SECRET_KEY}` },
        });
        const subscription = subRes.ok ? await subRes.json() : null;

        await upsertSubscription({
          user_id: userId,
          plan: "pro",
          status: subscription?.status ?? "active",
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          trial_ends_at: subscription?.trial_end
            ? new Date(subscription.trial_end * 1000).toISOString()
            : null,
        });

        console.log("checkout.session.completed — activated", userId);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const customerId = sub["customer"] as string;
        const subscriptionId = sub["id"] as string;
        const status = sub["status"] as string;
        const periodEnd = sub["current_period_end"] as number | null;

        const userId = await getUserIdFromCustomer(customerId);
        if (!userId) {
          console.error("No supabase_user_id on Stripe customer", customerId);
          break;
        }

        const trialEnd = sub["trial_end"] as number | null;

        await upsertSubscription({
          user_id: userId,
          plan: "pro",
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          status: status === "active" || status === "trialing" ? status : "free",
          current_period_end: periodEnd
            ? new Date(periodEnd * 1000).toISOString()
            : null,
          trial_ends_at: trialEnd
            ? new Date(trialEnd * 1000).toISOString()
            : null,
        });

        console.log("customer.subscription.updated — status:", status, userId);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const customerId = sub["customer"] as string;

        const userId = await getUserIdFromCustomer(customerId);
        if (!userId) {
          console.error("No supabase_user_id on Stripe customer", customerId);
          break;
        }

        await upsertSubscription({
          user_id: userId,
          plan: "free",
          stripe_customer_id: customerId,
          status: "free",
          stripe_subscription_id: null,
          current_period_end: null,
          trial_ends_at: null,
        });

        console.log("customer.subscription.deleted — reverted to free", userId);
        break;
      }

      default:
        console.log("Unhandled Stripe event type:", event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("stripe-webhook handler error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
