# Trestle — design system

Pattern sources are listed in [docs/DESIGN_REFERENCES.md](docs/DESIGN_REFERENCES.md).

## Principles

1. **Photography first.** Garments carry the page. The UI is thin: hairline borders, no drop
   shadows on content, no gradients.
2. **One voice of type.** A single grotesk for everything. Hierarchy comes from size, weight and
   letter-spacing, not from many typefaces.
3. **Neutral, warm palette.** Bone, ink and stone. Colour appears only in the photographs, the
   colour swatches, and small status signals.
4. **Quiet motion.** 150–300 ms ease-out fades and image cross-fades, with no bounce and no
   parallax. Everything becomes instant under `prefers-reduced-motion`.
5. **Honest states.** Loading uses skeletons at the real layout size. Empty and error states say
   what happened and offer the next step. Unavailable features say they are not configured.

## Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#f7f6f2` bone | `#0f0f0e` | page |
| `--foreground` | `#171614` ink | `#eeece6` | text |
| `--card` | `#ffffff` | `#171715` | raised surfaces (drawers, dialogs) |
| `--muted` | `#eeece6` | `#1f1f1c` | image placeholders, chips |
| `--muted-foreground` | `#5f5c55` | `#a6a39b` | secondary text (≥ 4.5:1 on background) |
| `--border` | `#dedbd3` | `#2c2b28` | hairlines |
| `--primary` | `#171614` | `#eeece6` | primary buttons (ink) |
| `--accent` | `#8a3b1e` clay | `#e39a74` | focus details, “New” labels |
| `--success / --warning / --danger / --info` | AA-checked pairs | AA-checked pairs | order and payment status only |
| `--trust` | `#0f5e57` | `#4fc3b4` | stablecoin escrow / provenance badges |

Radius: `0` for images and product cards, `2px` for inputs and buttons, and pills (`999px`) for
size and filter chips.

## Type

**Inter Tight** (variable, via `next/font`, self-hosted at build time) with a system-UI fallback.

| Role | Size / line height / tracking |
|---|---|
| Display (campaign) | clamp(2.5rem, 6vw, 5rem) / 1.0 / −0.03em, weight 500 |
| H1 (page title) | 2rem → 2.5rem / 1.1 / −0.02em, weight 500 |
| H2 (section) | 1.25rem / 1.3 / −0.01em, weight 500 |
| Body | 0.9375rem / 1.55 |
| Small / meta | 0.8125rem / 1.4 |
| Eyebrow / nav | 0.6875rem uppercase / 0.12em tracking, weight 500 |

Prices use `font-variant-numeric: tabular-nums`.

## Layout

- Container: full-bleed imagery; text containers are max 1440 px with 16 px (mobile), 24 px (tablet)
  or 40 px (desktop) gutters.
- Product grid: 2 columns at < 768 px, 3 columns at 768–1279 px and 4 columns at ≥ 1280 px. Gaps are
  2 px between images (editorial tightness), with text below each image.
- Product images are 3:4. Editorial tiles span 2 columns or 2 rows.
- Product page: a 7/5 split on desktop (gallery / sticky info) and a single column on mobile with a
  sticky add-to-bag bar.

## Components (shadcn/ui-style, on Radix, restyled)

Button, Input, Label, Textarea, Select (Radix), Checkbox, Dialog, Sheet (Dialog-based side and bottom
drawers), Accordion (Radix), Navigation Menu (Radix), Tooltip, Toast (sonner), Skeleton, Carousel
(Embla), Badge, Separator and Breadcrumb. Store-specific pieces: ProductCard, SwatchRow, SizePicker,
QuickAdd, Gallery with ZoomDialog, FilterSheet, SearchOverlay, BagDrawer, Price, StatusPill,
PaymentChoice and OrderTimeline.

## Accessibility

- Every interactive element is reachable by keyboard with a visible 2 px focus ring (`outline`
  offset 2 px).
- Colour swatches have text labels (visually hidden plus a tooltip) and `aria-pressed`. Sold-out
  sizes are `aria-disabled` and announced “sold out”.
- Dialogs, sheets and the search overlay trap focus and restore it on close (Radix).
- Images have descriptive alt text naming the garment and colour. Decorative campaign duplicates use
  `alt=""`.
- Minimum touch target 44 × 44 px on mobile controls.
- Themes: light and dark follow the system by default, with a manual toggle in the footer.
