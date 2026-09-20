import { requireHostAccount } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireHostAccount();
  if ("response" in authResult) return authResult.response;

  return Response.json(
    {
      account: {
        lifecycleState: authResult.account.lifecycleState,
        deletionRequestedAt: authResult.account.deletionRequestedAt,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
