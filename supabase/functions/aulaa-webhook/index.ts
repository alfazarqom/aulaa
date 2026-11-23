/**
 * Aulaa webhook receiver.
 *
 * IMPORTANT:
 * The public Aulaa documentation available during this implementation confirms
 * that a project Webhook Secret exists, but does not expose the exact signature
 * header, signing algorithm, or webhook payload contract.
 *
 * This endpoint intentionally fails closed until those details are confirmed
 * from Aulaa's official webhook documentation/support. Do not accept or persist
 * unverified webhook payloads.
 */
Deno.serve((req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      error: "Aulaa webhook verification contract is not yet configured",
    }),
    {
      status: 501,
      headers: { "Content-Type": "application/json" },
    },
  );
});
