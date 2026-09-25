import { prisma } from "@trestle/db";
import { formatUsdMicros } from "@trestle/shared";
import { notFound, route } from "@/server/http";

/** ERC-721 metadata for certificates (tokenURI points here). */
export const GET = route<{ productId: string }>({}, async ({ params, req }) => {
  const p = await prisma.product.findUnique({
    where: { id: params.productId },
    include: { seller: true },
  });
  if (!p) throw notFound("Product");
  const origin = new URL(req.url).origin;
  return {
    name: `Trestle Certificate — ${p.title}`,
    description: `On-chain certificate of authenticity for “${p.title}” listed by ${p.seller.storefrontName} on Trestle.`,
    image: `${origin}${p.images[0]?.startsWith("/") ? p.images[0] : "/art/certificate?category=cert"}`,
    external_url: `${origin}/products/${p.id}`,
    attributes: [
      { trait_type: "Manufacturer", value: p.manufacturer ?? "Unspecified" },
      { trait_type: "Category", value: p.category },
      { trait_type: "Original seller", value: p.seller.storefrontName },
      { trait_type: "List price", value: formatUsdMicros(p.priceUsdMicros) },
    ],
  };
});
