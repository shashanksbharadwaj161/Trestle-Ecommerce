# Image credits

All product and campaign photographs in `apps/web/public/images/catalog/` are unmodified copies of the
**Sylius demo fixture images**. Details:

- Source: <https://github.com/Sylius/Sylius>, path `src/Sylius/Bundle/CoreBundle/Resources/fixtures/`.
- Commit `93103c71e643c8bc25932905fb1387b1719dc687`. The images were added in Sylius commit `51b269b420`
  (2024-11-20, “Replace all images by webp”).
- Licence: MIT, © Sylius Sp. z o.o. The licence text is vendored next to the images as
  `LICENSE-SYLIUS.txt`.
- Nature: the photographs appear to be AI-generated. The models are not real people, and the
  garments are not products of any real brand.

Filenames keep the source path (e.g. `jeans-woman-jeans_03_1.webp` ←
`fixtures/jeans/woman/jeans_03_1.webp`). Each `ProductImage` row stores `credit`, `license` and a
`sourceUrl` pointing at the exact source file.

## Garment-to-image consistency

Every image was viewed before it was assigned. Each product's name, category and colour were
written from what the photos show. Images are attached to the colour they depict, so a swatch only
shows photographs of that colour. Where one Sylius product group showed several colours (e.g.
`t-shirt_01_*`: black, black, sky, red), they became colour variants of one product. Where a group's
photos showed different cuts, they were split into separate products or left out.

Known limitations, disclosed rather than hidden:

- For denim, the model also wears a top that varies between angles; the product is the jeans or
  shorts.
- Some colourways are photographed on a different model from the other colours of the same product.
- The photos share one sunny beach setting, so the brand story is framed as a summer collection
  (“Summer 26”). Knit hats are shot in town and positioned as an accessories line.

## Before a real launch

Replace the images with the store's own photography of its own garments. Update
`packages/db/seed/catalog.ts`, or upload through the admin, which writes `ProductImage` rows with
your own credit.
