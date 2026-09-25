import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * next/link with prefetching OFF by default. Every storefront page is dynamic, so a viewport prefetch is a
 * full server render per visible link (dozens per page view), which competes with the navigation the shopper
 * actually asked for. It also triggered an App Router race: after rapid clicks the URL could change while the
 * previous page stayed on screen. Pass prefetch explicitly where a prefetch is known to be worth it.
 */
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
