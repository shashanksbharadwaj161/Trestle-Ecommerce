"use client";
/**
 * Minimal, fail-safe View Transitions for App Router navigations.
 * - Progressive enhancement: browsers without document.startViewTransition, and users who prefer reduced
 *   motion, get a normal navigation.
 * - The transition's update callback resolves when the new route has committed (see <ViewTransitionDone/>)
 *   or after a hard timeout, so a transition can never block navigation.
 */
type Router = { push: (href: string, opts?: { scroll?: boolean }) => void };

let finish: (() => void) | null = null;

export function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function navigateWithTransition(router: Router, href: string, sharedEl?: HTMLElement | null) {
  const doc = document as Document & { startViewTransition?: (cb: () => Promise<void>) => unknown };
  if (!doc.startViewTransition || reducedMotion()) {
    router.push(href);
    return;
  }
  // only one element may carry the shared name at a time (e.g. the current PDP hero when clicking a related item)
  document.querySelectorAll<HTMLElement>("[data-vt-hero]").forEach((el) => (el.style.viewTransitionName = "none"));
  if (sharedEl) sharedEl.style.viewTransitionName = "product-hero";
  doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const done = () => {
          if (sharedEl) sharedEl.style.viewTransitionName = "";
          finish = null;
          resolve();
        };
        finish = done;
        router.push(href);
        setTimeout(done, 1200);
      }),
  );
}

/** Called by <ViewTransitionDone/> once the new route has rendered. */
export function completeViewTransition() {
  finish?.();
}
