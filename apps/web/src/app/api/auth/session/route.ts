import { route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route({}, async ({ user }) => ({
  user: user
    ? { id: user.id, walletAddress: user.walletAddress, role: user.role, displayName: user.displayName, sellerId: user.sellerId }
    : null,
}));
