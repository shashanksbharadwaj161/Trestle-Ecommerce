/** Storefront navigation. Every href here resolves to a real, filterable listing. */
export interface NavGroup {
  label: string;
  href: string;
  links: { label: string; href: string }[];
}

export const NAV: NavGroup[] = [
  {
    label: "Women",
    href: "/women",
    links: [
      { label: "New arrivals", href: "/women?new=1" },
      { label: "Dresses", href: "/women?category=dresses" },
      { label: "T-shirts", href: "/women?category=t-shirts" },
      { label: "Jeans", href: "/women?category=jeans" },
      { label: "Shorts", href: "/women?category=shorts" },
      { label: "View all women", href: "/women" },
    ],
  },
  {
    label: "Men",
    href: "/men",
    links: [
      { label: "New arrivals", href: "/men?new=1" },
      { label: "T-shirts", href: "/men?category=t-shirts" },
      { label: "Jeans", href: "/men?category=jeans" },
      { label: "Shorts", href: "/men?category=shorts" },
      { label: "View all men", href: "/men" },
    ],
  },
  {
    label: "Accessories",
    href: "/accessories",
    links: [
      { label: "Knit hats", href: "/accessories?category=knit-hats" },
      { label: "View all accessories", href: "/accessories" },
    ],
  },
];

export const HELP_LINKS = [
  { label: "Help centre", href: "/help" },
  { label: "Delivery", href: "/delivery" },
  { label: "Returns", href: "/returns" },
  { label: "Size guide", href: "/size-guide" },
  { label: "Garment care", href: "/care" },
  { label: "Payment options", href: "/payments" },
  { label: "Contact us", href: "/contact" },
];
