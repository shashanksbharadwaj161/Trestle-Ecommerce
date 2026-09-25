# Design references

What was studied, how it was accessed, and which **patterns** (not assets) Trestle adopted. No copy,
imagery, logos, code or paid UI-kit files from any reference were used.

Access note: this project was built in a sandboxed cloud container whose egress proxy **blocks** most
retail sites (`www.cos.com`, `www.arket.com`, `toteme.com`, `www.apple.com`, `dribbble.com`,
`ui.shadcn.com`). Direct fetches returned HTTP 403 / connection refused. COS was read once through a
third-party scraping service before the owner asked for no paid tools; everything else comes from
public search-engine summaries and from my working knowledge of the sites. Those rows are marked
**not inspected directly**, and none of their content is quoted.

| Reference | URL | Access | Patterns adopted in Trestle |
|---|---|---|---|
| COS — Women / New arrivals | https://www.cos.com/en-us/women/new-arrivals | Page content read once (text + structure) | Breadcrumb “Women / New arrivals” above a large, quiet page title. Single **“Filter & sort”** control opening a panel instead of a sidebar. **Editorial campaign tiles interleaved in the product grid.** Tiles show just name + price, with a **“+N” colour-count** badge. Sentence-case descriptive product names (“Shawl-collar double-faced wool long coat”). “Explore more” category links under the title. Visible progress (“48 of 1072”) with a load-more button. |
| ARKET — Women / Clothing | https://www.arket.com/en-gb/women/clothing/ | **Not inspected directly** (blocked); search summaries only | Category chips across the top of the listing. Filters by colour, material and size. Sort by price and newness. A calm, catalogue-like grid with generous whitespace. |
| Toteme — Ready-to-wear | https://toteme.com/en-us/collections/ready-to-wear | **Not inspected directly** (blocked) | The general “quiet luxury” register: restrained palette, large photography, minimal UI chrome. Header links as small uppercase tracking-wide text. |
| Maniro mobile UI kit (Dribbble) | https://dribbble.com/shots/24740474-Maniro-Online-shop-Mobile-UI-Kit-Cards-and-Components · https://dribbble.com/tags/ui-components | **Not inspected directly** (blocked); used only as a mood cue | Mobile card anatomy: image-first card with a round wishlist button over the image, compact swatch row, price below. Pill-shaped size chips. Bottom sheets for filters. No kit assets used — Dribbble is inspiration, not a licence. |
| shadcn/ui components | https://ui.shadcn.com/docs/components | **Not inspected directly** (docs host blocked); the underlying libraries were installed from npm | Component vocabulary and composition: Radix primitives (Dialog, Sheet/Drawer via Dialog, Accordion, Select, Navigation Menu, Tooltip, Toast via sonner), `cva` variants, `cn()` merging, Embla carousel, Skeleton. Rebuilt locally in `apps/web/src/components/ui/*` and restyled to Trestle tokens. |
| Apple Store | https://www.apple.com/store | **Not inspected directly** (blocked); public descriptions of the 2021+ store redesign | **Horizontally scrolling shelves** of cards (“the latest”, category rows). A “why buy here” row of service cards (delivery, returns, help). A large, confident welcome headline. Sticky purchase summary on the product page. |

## How references map to Trestle screens

- **Header** (Toteme / COS): a thin announcement bar, then a centred wordmark with small uppercase
  department links (Women, Men, Accessories, Collections, New). The search icon opens a full-width
  overlay; the bag icon opens a right-hand drawer. The account icon links to sign-in or the account.
  On mobile, a sheet menu with an accordion per department.
- **Home** (COS + Apple shelves): a split campaign hero, then a shoppable-collection row. After that,
  a horizontally scrolling “New arrivals” shelf, an editorial two-up block, a category grid, and a
  service row (delivery, returns, payment choice, help).
- **Listing** (COS + ARKET): breadcrumb, title and count, category chips, one “Filter & sort” button
  (a sheet on mobile, a panel on desktop), and a URL-backed state. The grid is 2 columns on mobile,
  3 on tablet and 4 on desktop, with 3:4 images. Every 9th slot is an editorial campaign tile. Cards
  swap to an alternate image on hover only when a second image exists. Swatch dots show “+N” overflow,
  and quick-add opens a size picker.
- **Product** (COS + Apple): a vertical image stack on desktop and a swipe carousel with dots on
  mobile; tap to zoom in a full-screen dialog. A sticky info column holds name, price, colour and size
  selectors (sold-out sizes struck through), the size guide dialog, and an accordion for details, fit,
  material and care, delivery and returns. A sticky add-to-bag bar sits at the bottom on mobile.
- **Bag / checkout** (Apple): a calm summary column with exact totals. Card (Stripe hosted) is the
  default payment; stablecoin escrow is offered as a secondary choice with its trust explanation.
