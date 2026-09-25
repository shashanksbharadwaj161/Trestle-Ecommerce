"use client";

/**
 * Renders a layout's streamed `children` from inside a component instead of directly under a host element.
 *
 * If the RSC chunk for `children` has not arrived when hydration reaches `<main>`, React suspends while
 * reconciling `<main>`'s children and later replays `<main>` itself. React 19.2 replays a host component
 * without rewinding its hydration cursor, so `<main>` then tries to claim its own first child and hydration
 * fails (error #418) — intermittently, depending on how the HTML stream and the JS race. Suspending inside
 * this component instead replays only this component, which claims no DOM.
 */
export function SegmentOutlet({ children }: { children: React.ReactNode }) {
  return children;
}
