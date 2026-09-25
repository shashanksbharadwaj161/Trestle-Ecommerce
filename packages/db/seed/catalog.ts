/** Demo catalog. Prices are exact USD strings (converted to integer micro-USD). */
export interface SeedVariant {
  name: string;
  attributes: Record<string, string>;
  stock: number;
}
export interface SeedProduct {
  key: string;
  title: string;
  description: string;
  price: string;
  category: string;
  manufacturer?: string;
  featured?: boolean;
  variants: SeedVariant[];
}
export interface SeedSeller {
  key: "chronos" | "sole" | "lumen";
  storefrontName: string;
  slug: string;
  bio: string;
  verified: boolean;
  /** "B" = settlement chain B, "A" = chain A */
  payoutChain: "A" | "B";
  payoutSymbol: "tUSDC" | "tDAI";
  products: SeedProduct[];
}

const sizes = (stock: number[]) =>
  ["US 8", "US 9", "US 10", "US 11"].map((s, i) => ({
    name: s,
    attributes: { size: s },
    stock: stock[i] ?? 0,
  }));
const apparel = (stock: number[]) =>
  ["S", "M", "L", "XL"].map((s, i) => ({ name: s, attributes: { size: s }, stock: stock[i] ?? 0 }));

export const SELLERS: SeedSeller[] = [
  {
    key: "chronos",
    storefrontName: "Chronos & Co.",
    slug: "chronos-and-co",
    bio: "Independent watch and camera dealer since 2011. Every piece is inspected, serviced and shipped with an on-chain certificate of authenticity.",
    verified: true,
    payoutChain: "B",
    payoutSymbol: "tUSDC",
    products: [
      {
        key: "meridian-automatic",
        title: "Meridian Automatic 39mm",
        description:
          "A 39mm stainless steel automatic with a 72-hour power reserve, sapphire crystal and 100m water resistance. Serviced in 2026, full box and papers.",
        price: "1250.00",
        category: "Watches",
        manufacturer: "Meridian Horology",
        featured: true,
        variants: [
          { name: "Steel / Black dial", attributes: { case: "Steel", dial: "Black" }, stock: 4 },
          { name: "Steel / Blue dial", attributes: { case: "Steel", dial: "Blue" }, stock: 3 },
        ],
      },
      {
        key: "aviator-gmt",
        title: "Aviator Chronograph GMT",
        description:
          "Grade 5 titanium pilot's chronograph with a true flyer GMT complication and luminous applied indices. Limited run of 250 pieces.",
        price: "2480.00",
        category: "Watches",
        manufacturer: "Northwind Instruments",
        variants: [{ name: "Titanium", attributes: { case: "Titanium" }, stock: 2 }],
      },
      {
        key: "lunar-poster",
        title: "1969 Lunar Mission Poster — Signed",
        description:
          "Original lithograph from the 1969 lunar mission press run, hand-signed and archivally framed. Provenance documented through three prior owners.",
        price: "640.00",
        category: "Art & Prints",
        manufacturer: "Archive Editions",
        variants: [{ name: "Framed, 1 of 1", attributes: { edition: "1/1" }, stock: 1 }],
      },
      {
        key: "leica-m3",
        title: "Vintage Rangefinder M3 (1958)",
        description:
          "Double-stroke 1958 rangefinder body, recently cleaned, lubricated and adjusted. Bright, contrasty viewfinder and accurate shutter speeds.",
        price: "1890.00",
        category: "Collectibles",
        manufacturer: "Wetzlar Optics",
        variants: [{ name: "Body only", attributes: { condition: "Excellent" }, stock: 1 }],
      },
      {
        key: "watch-roll",
        title: "Hand-bound Leather Watch Roll",
        description:
          "Vegetable-tanned leather roll that holds three watches, lined with undyed wool felt.",
        price: "145.00",
        category: "Home",
        manufacturer: "Chronos Atelier",
        variants: [
          { name: "Tan", attributes: { color: "Tan" }, stock: 12 },
          { name: "Black", attributes: { color: "Black" }, stock: 8 },
        ],
      },
    ],
  },
  {
    key: "sole",
    storefrontName: "Sole Society",
    slug: "sole-society",
    bio: "Deadstock and limited sneakers, authenticated in-house. Streetwear staples cut and sewn in Portugal.",
    verified: true,
    payoutChain: "B",
    payoutSymbol: "tDAI",
    products: [
      {
        key: "aurora-runner",
        title: "Aurora Runner “Glacier”",
        description:
          "Engineered-mesh runner with a supercritical foam midsole and reflective heel counter.",
        price: "220.00",
        category: "Sneakers",
        manufacturer: "Aurora Athletics",
        featured: true,
        variants: sizes([3, 6, 5, 2]),
      },
      {
        key: "court-classic",
        title: "Court Classic Low “Chalk”",
        description:
          "Full-grain leather court shoe with a cupsole and gum outsole. An everyday classic.",
        price: "165.00",
        category: "Sneakers",
        manufacturer: "Aurora Athletics",
        variants: sizes([4, 8, 8, 3]),
      },
      {
        key: "retro-high",
        title: "Retro High OG “Ember”",
        description:
          "Limited retro high-top in tumbled leather. Deadstock, original box, extra laces.",
        price: "340.00",
        category: "Sneakers",
        manufacturer: "Heritage Court",
        featured: true,
        variants: sizes([1, 2, 1, 1]),
      },
      {
        key: "loopback-hoodie",
        title: "Heavyweight Loopback Hoodie",
        description: "480gsm loopback cotton, dropped shoulder, double-layer hood. Garment dyed.",
        price: "120.00",
        category: "Apparel",
        manufacturer: "Sole Society",
        variants: apparel([6, 10, 9, 4]),
      },
      {
        key: "merino-overshirt",
        title: "Merino Travel Overshirt",
        description: "Temperature-regulating merino twill overshirt with hidden zip pockets.",
        price: "185.00",
        category: "Apparel",
        manufacturer: "Sole Society",
        variants: apparel([3, 5, 5, 2]),
      },
    ],
  },
  {
    key: "lumen",
    storefrontName: "Lumen Labs",
    slug: "lumen-labs",
    bio: "Small-batch audio gear and desk tools. We get paid on Chain A — buyers on Chain B settle cross-chain automatically.",
    verified: false,
    payoutChain: "A",
    payoutSymbol: "tUSDC",
    products: [
      {
        key: "halo-anc",
        title: "Halo ANC Headphones",
        description:
          "Hybrid active noise cancelling headphones with 40mm beryllium drivers and 38h battery life.",
        price: "349.00",
        category: "Electronics",
        manufacturer: "Lumen Labs",
        featured: true,
        variants: [
          { name: "Graphite", attributes: { color: "Graphite" }, stock: 9 },
          { name: "Sand", attributes: { color: "Sand" }, stock: 6 },
        ],
      },
      {
        key: "pocket-keyboard",
        title: "Pocket Mechanical Keyboard 65%",
        description:
          "Gasket-mounted aluminium 65% keyboard with hot-swap sockets and tri-mode wireless.",
        price: "189.00",
        category: "Electronics",
        manufacturer: "Lumen Labs",
        variants: [
          { name: "Linear switches", attributes: { switches: "Linear" }, stock: 10 },
          { name: "Tactile switches", attributes: { switches: "Tactile" }, stock: 7 },
        ],
      },
      {
        key: "arc-lamp",
        title: "Arc Desk Lamp",
        description:
          "Dimmable, high-CRI desk lamp with an asymmetric light guide that keeps glare off your screen.",
        price: "129.00",
        category: "Home",
        manufacturer: "Lumen Labs",
        variants: [{ name: "Matte white", attributes: { finish: "Matte white" }, stock: 15 }],
      },
      {
        key: "field-recorder",
        title: "Field Recorder Pro",
        description: "32-bit float four-track field recorder with dual XLR inputs and timecode.",
        price: "499.00",
        category: "Electronics",
        manufacturer: "Lumen Labs",
        variants: [{ name: "Standard", attributes: {}, stock: 5 }],
      },
      {
        key: "pour-over",
        title: "Ceramic Pour-Over Set",
        description: "Hand-thrown stoneware dripper, carafe and two cups. Dishwasher safe.",
        price: "68.00",
        category: "Home",
        manufacturer: "Kiln & Co.",
        variants: [
          { name: "Speckled", attributes: { glaze: "Speckled" }, stock: 14 },
          { name: "Midnight", attributes: { glaze: "Midnight" }, stock: 9 },
        ],
      },
    ],
  },
];

export function artUrl(key: string, category: string, variant = 0): string {
  return `/art/${key}?category=${encodeURIComponent(category)}&v=${variant}`;
}
