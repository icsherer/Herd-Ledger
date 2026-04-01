// Deploy: supabase functions deploy create-checkout-session --no-verify-jwt

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_PRICE_MONTHLY = Deno.env.get("STRIPE_PRICE_MONTHLY")!;
const STRIPE_PRICE_ANNUAL = Deno.env.get("STRIPE_PRICE_ANNUAL")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function stripePost(path: string, params: Record<string, string>) {
  const body = new URLSearchParams(params).toString();
  return fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
}

function stripeGet(path: string) {
  return fetch(`https://api.stripe.com/v1${path}`, {
    headers: { "Authorization": `Bearer ${STRIPE_SECRET_KEY}` },
  });
}

async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  // Check if we already have a stripe_customer_id stored
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=stripe_customer_id`,
    {
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (res.ok) {
    const rows = await res.json();
    if (rows?.[0]?.stripe_customer_id) return rows[0].stripe_customer_id;
  }

  // Create a new Stripe customer
  const createRes = await stripePost("/customers", {
    email,
    "metadata[supabase_user_id]": userId,
  });
  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Stripe create customer failed: ${err}`);
  }
  const customer = await createRes.json();
  return customer.id;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  try {
    // Authenticate user via Supabase JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const jwt = authHeader.slice(7);

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${jwt}`,
      },
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const user = await userRes.json();
    const userId: string = user.id;
    const email: string = user.email;

    // Determine plan
    const url = new URL(req.url);
    const plan = url.searchParams.get("plan") === "annual" ? "annual" : "monthly";
    const priceId = plan === "annual" ? STRIPE_PRICE_ANNUAL : STRIPE_PRICE_MONTHLY;

    if (!priceId) {
      return new Response(JSON.stringify({ error: `Missing price env var for plan: ${plan}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const stripeCustomerId = await getOrCreateStripeCustomer(userId, email);

    // Create checkout session
    const sessionRes = await stripePost("/checkout/sessions", {
      "customer": stripeCustomerId,
      "mode": "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      "subscription_data[trial_period_days]": "30",
      "subscription_data[metadata][supabase_user_id]": userId,
      "success_url": "https://app.herdledger.app?subscription=success",
      "cancel_url": "https://app.herdledger.app?subscription=cancelled",
    });

    if (!sessionRes.ok) {
      const err = await sessionRes.text();
      throw new Error(`Stripe create session failed: ${err}`);
    }

    const session = await sessionRes.json();

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("create-checkout-session error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
