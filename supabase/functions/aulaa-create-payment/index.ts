const AULAA_API_URL = "https://api.aulaa.co/v1/payments";
const PAYMENT_URL = "https://payment.aulaa.co/pay/";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("AULAA_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!apiKey || !supabaseUrl || !serviceKey) {
    return json({ error: "Payment service is not configured" }, 500);
  }

  let input: { order_id?: unknown; amount?: unknown };
  try {
    input = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const orderId = typeof input.order_id === "string" ? input.order_id.trim() : "";
  const amount = input.amount;
  if (!orderId || !Number.isSafeInteger(amount) || (amount as number) < 1000 ||
      (amount as number) > 500000000) {
    return json({ error: "order_id and integer amount (IDR 1,000–500,000,000) are required" }, 400);
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  let aulaaResponse = await fetch(AULAA_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ order_id: orderId, amount }),
  });

  let aulaaData: Record<string, unknown>;
  try {
    aulaaData = await aulaaResponse.json();
  } catch {
    return json({ error: "Invalid response from Aulaa" }, 502);
  }

  // Aulaa returns 409 for an order_id that already has an invoice.
  // Recover that invoice using the payment_id returned by Aulaa.
  if (aulaaResponse.status === 409) {
    const existingId = aulaaData.payment_id;
    if (typeof existingId !== "string" && typeof existingId !== "number") {
      return json({ error: "Aulaa reported a duplicate order without payment_id" }, 502);
    }
    aulaaResponse = await fetch(`${AULAA_API_URL}/${encodeURIComponent(String(existingId))}`, {
      method: "GET",
      headers,
    });
    try {
      aulaaData = await aulaaResponse.json();
    } catch {
      return json({ error: "Could not retrieve the existing Aulaa invoice" }, 502);
    }
  }

  if (!aulaaResponse.ok) {
    return json({ error: "Aulaa payment request failed", details: aulaaData }, 502);
  }

  const paymentId = aulaaData.id;
  if (typeof paymentId !== "string" && typeof paymentId !== "number") {
    return json({ error: "Aulaa response is missing invoice id" }, 502);
  }

  const paymentLink = typeof aulaaData.payment_link === "string"
    ? aulaaData.payment_link
    : PAYMENT_URL + encodeURIComponent(String(paymentId));

  const row = {
    order_id: orderId,
    aulaa_payment_id: String(paymentId),
    amount: aulaaData.amount ?? amount,
    fee_amount: aulaaData.fee_amount ?? 0,
    charged_amount: aulaaData.charged_amount ?? null,
    status: aulaaData.status ?? "pending",
    payment_method: aulaaData.payment_method ?? null,
    payment_number: aulaaData.payment_number ?? null,
    payment_link: paymentLink,
    currency: aulaaData.currency ?? "IDR",
    country_code: aulaaData.country_code ?? "ID",
    expires_at: aulaaData.expired_at ?? null,
    paid_at: aulaaData.paid_at ?? null,
    raw_response: aulaaData,
    updated_at: new Date().toISOString(),
  };

  const saved = await fetch(
    `${supabaseUrl}/rest/v1/aulaa_transactions?on_conflict=order_id`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(row),
    },
  );

  if (!saved.ok) {
    return json({ error: "Could not save Aulaa transaction", details: await saved.text() }, 500);
  }

  return json({ order_id: orderId, payment_id: String(paymentId), payment_link: paymentLink, status: row.status });
});
