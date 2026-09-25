import type { EditorialTile } from "@/components/listing/listing-page";

const img = (ref: string) => `/images/catalog/${ref.replace(/\//g, "-")}.webp`;

export const EDITORIAL: Record<string, EditorialTile[]> = {
  women: [
    { href: "/collections/summer-26", image: img("dresses/dress_06"), kicker: "Summer 26", title: "Long dresses for long days" },
    { href: "/collections/denim", image: img("jeans/woman/jeans_03_3"), kicker: "The denim edit", title: "Wide, straight and cut-off" },
    { href: "/collections/essential-tees", image: img("t-shirts/woman/t-shirt_06_2"), kicker: "Essential tees", title: "Jersey, every day" },
  ],
  men: [
    { href: "/collections/essential-tees", image: img("t-shirts/man/t-shirt_09_2"), kicker: "Essential tees", title: "The tee, considered" },
    { href: "/collections/denim", image: img("jeans/man/jeans_13_1"), kicker: "The denim edit", title: "Straight-leg, pale wash" },
  ],
  accessories: [
    { href: "/collections/knit-hats", image: img("caps/cap_05_1"), kicker: "Knit hats", title: "Soft rib, slouched" },
  ],
  all: [
    { href: "/collections/summer-26", image: img("dresses/dress_04"), kicker: "Summer 26", title: "The ivory maxi" },
    { href: "/collections/denim", image: img("jeans/woman/jeans_17_1"), kicker: "The denim edit", title: "Bermuda season" },
  ],
};

export const img_ = img;
