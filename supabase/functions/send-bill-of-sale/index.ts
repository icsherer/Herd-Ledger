// Deploy: supabase functions deploy send-bill-of-sale --no-verify-jwt

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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
    const { toEmail, toName, farmName, senderEmail, pdfBase64, animalCount, saleDate } = await req.json();

    if (!toEmail || !pdfBase64) {
      return new Response(JSON.stringify({ error: "toEmail and pdfBase64 are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const displayDate = saleDate
      ? new Date(saleDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "N/A";

    const filename = `bill-of-sale-${saleDate || new Date().toISOString().slice(0, 10)}.pdf`;

    const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
  <div style="background:#1B4332;padding:32px 36px 24px;">
    <div style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">Herd Ledger</div>
    <div style="font-size:11px;color:#B8960C;letter-spacing:3px;text-transform:uppercase;margin-top:4px;">Livestock Management</div>
  </div>
  <div style="padding:32px 36px;color:#222222;">
    <p style="font-size:16px;margin:0 0 16px;">Hello ${toName || "there"},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
      Please find attached your bill of sale for
      <strong>${animalCount != null ? animalCount : "?"} animal(s)</strong>
      purchased on <strong>${displayDate}</strong>${farmName ? ` from <strong>${farmName}</strong>` : ""}.
    </p>
    <p style="font-size:14px;color:#666666;margin:0 0 24px;">
      Keep this document for your records. If you have any questions, please contact the seller directly.
    </p>
    <hr style="border:none;border-top:1px solid #E8E0D0;margin:0 0 20px;" />
    <p style="font-size:12px;color:#999999;margin:0;">
      Sent via <a href="https://herdledger.app" style="color:#B8960C;text-decoration:none;">herdledger.app</a>
    </p>
  </div>
</div>
`.trim();

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${farmName || "Herd Ledger"} via Herd Ledger <ian@herdledger.app>`,
        to: [toEmail],
        reply_to: senderEmail || "iancsherer@gmail.com",
        subject: `Your Bill of Sale from ${farmName || "Herd Ledger"}`,
        html,
        attachments: [
          {
            filename,
            content: pdfBase64,
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Resend error", res.status, body);
      return new Response(JSON.stringify({ error: "Failed to send email", detail: body }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const data = await res.json();
    console.log("Bill of sale email sent to", toEmail, data.id);
    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    console.error("Unexpected error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
