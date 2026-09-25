import type { NextRequest } from "next/server";

/** Deterministic, dependency-free product artwork (SVG) so the demo catalog never relies on hotlinked images. */
const PALETTES = [
  ["#1e1b4b", "#7c3aed", "#c4b5fd"],
  ["#0c4a6e", "#0ea5e9", "#bae6fd"],
  ["#14532d", "#22c55e", "#bbf7d0"],
  ["#7c2d12", "#f97316", "#fed7aa"],
  ["#4a044e", "#d946ef", "#f5d0fe"],
  ["#1f2937", "#64748b", "#e2e8f0"],
  ["#713f12", "#eab308", "#fef08a"],
  ["#881337", "#f43f5e", "#fecdd3"],
];

const GLYPHS: Record<string, string> = {
  Watches:
    '<circle cx="0" cy="0" r="70" fill="none" stroke="currentColor" stroke-width="10"/><rect x="-18" y="-120" width="36" height="50" rx="8"/><rect x="-18" y="70" width="36" height="50" rx="8"/><line x1="0" y1="0" x2="0" y2="-45" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><line x1="0" y1="0" x2="32" y2="10" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>',
  Sneakers:
    '<path d="M-110 30 C-100 -20 -60 -30 -30 -10 L10 -40 C40 -30 60 0 110 10 L115 45 L-110 45 Z" /><rect x="-115" y="45" width="230" height="16" rx="8" opacity="0.7"/>',
  Electronics:
    '<rect x="-90" y="-60" width="180" height="120" rx="20" fill="none" stroke="currentColor" stroke-width="10"/><circle cx="-35" cy="0" r="22"/><circle cx="35" cy="0" r="22"/>',
  "Art & Prints":
    '<rect x="-80" y="-100" width="160" height="200" rx="6" fill="none" stroke="currentColor" stroke-width="10"/><circle cx="-20" cy="-30" r="22"/><path d="M-65 80 L-15 10 L20 45 L45 20 L65 80 Z"/>',
  Home: '<path d="M-90 0 L0 -80 L90 0 L90 90 L-90 90 Z" fill="none" stroke="currentColor" stroke-width="10" stroke-linejoin="round"/><rect x="-22" y="30" width="44" height="60" rx="6"/>',
  Apparel:
    '<path d="M-40 -90 L-100 -50 L-75 -10 L-55 -25 L-55 90 L55 90 L55 -25 L75 -10 L100 -50 L40 -90 C25 -65 -25 -65 -40 -90 Z"/>',
  Collectibles:
    '<rect x="-95" y="-55" width="190" height="115" rx="14" fill="none" stroke="currentColor" stroke-width="10"/><circle cx="0" cy="3" r="34" fill="none" stroke="currentColor" stroke-width="10"/><rect x="45" y="-80" width="36" height="22" rx="4"/>',
  seller: '<circle cx="0" cy="-30" r="40"/><path d="M-80 90 C-70 20 70 20 80 90 Z"/>',
  banner:
    '<path d="M-150 60 C-60 -40 60 120 150 -20" fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round"/>',
  cert: '<circle cx="0" cy="-20" r="60" fill="none" stroke="currentColor" stroke-width="10"/><path d="M-35 30 L-55 100 L0 75 L55 100 L35 30"/>',
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const category = req.nextUrl.searchParams.get("category") ?? "Collectibles";
  const variant = Number(req.nextUrl.searchParams.get("v") ?? "0") || 0;
  const h = hash(`${key}:${variant}`);
  const [dark, mid, light] = PALETTES[h % PALETTES.length]!;
  const glyph = GLYPHS[category] ?? GLYPHS.Collectibles!;
  const angle = (h >> 8) % 360;
  const rot = variant === 0 ? -8 : variant === 1 ? 6 : 0;
  const scale = variant === 2 ? 1.25 : 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" role="img" aria-label="${category} artwork">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${dark}"/><stop offset="1" stop-color="${mid}"/></linearGradient>
    <radialGradient id="r" cx=".3" cy=".25" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <circle cx="${150 + (h % 500)}" cy="${120 + ((h >> 4) % 520)}" r="${180 + (h % 120)}" fill="${light}" opacity=".18"/>
  <rect width="800" height="800" fill="url(#r)"/>
  <g transform="translate(400 410) rotate(${rot}) scale(${scale * 1.6})" fill="${light}" color="${light}">${glyph}</g>
</svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
