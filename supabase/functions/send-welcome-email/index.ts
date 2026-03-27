const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

Deno.serve(async (req: Request) => {
  try {
    const payload = await req.json();

    // Supabase Auth webhook: user.created event
    const email =
      payload?.user?.email ??
      payload?.record?.email ??
      payload?.email;

    if (!email) {
      console.error("No email found in payload", JSON.stringify(payload));
      return new Response(JSON.stringify({ error: "No email in payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const html = `
<h2 style="color:#1B3A2B;font-family:Arial,sans-serif;">Welcome to Herd Ledger</h2>
<p style="font-family:Arial,sans-serif;font-size:15px;">Your herd is in good hands.</p>
<p style="font-family:Arial,sans-serif;font-size:15px;">Here's what you can do right now:</p>
<ul style="font-family:Arial,sans-serif;font-size:15px;">
  <li>Add your animals</li>
  <li>Set up your pastures</li>
  <li>Log a breeding or health record</li>
  <li>Upload documents (Coggins, vet records, papers)</li>
</ul>
<p style="font-family:Arial,sans-serif;font-size:15px;">If you have any questions, just reply to this email.</p>
<p style="font-family:Arial,sans-serif;font-size:15px;">— Ian<br>herdledger.app</p>
`.trim();

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Ian at Herd Ledger <ian@herdledger.app>",
        to: [email],
        subject: "Welcome to Herd Ledger 🐄",
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Resend error", res.status, body);
      return new Response(JSON.stringify({ error: "Failed to send email", detail: body }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    console.log("Welcome email sent", email, data.id);
    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
