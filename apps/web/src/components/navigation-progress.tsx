"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

const START_EVENT = "trestle:navigation-start";

/** Call before a programmatic router.push so the bar appears immediately. */
export function signalNavigation() {
  window.dispatchEvent(new Event(START_EVENT));
}

/**
 * Immediate feedback for every navigation: a thin bar at the top of the window appears on the click (not when
 * the server answers), and clears when the new route commits. It never intercepts pointer events. If a route
 * takes unusually long, the bar stays and a status message says so (with a hard stop so it cannot stick).
 */
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<"idle" | "loading" | "slow">("idle");
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    const start = () => {
      clear();
      setState("loading");
      timers.current.push(window.setTimeout(() => setState("slow"), 6000));
      timers.current.push(window.setTimeout(() => setState("idle"), 30000));
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page / hash only
      start();
    };
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", start);
    window.addEventListener(START_EVENT, start);
    return () => {
      clear();
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", start);
      window.removeEventListener(START_EVENT, start);
    };
  }, []);

  // the route committed
  useEffect(() => {
    setState("idle");
  }, [pathname, search]);

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[2px] overflow-hidden"
        style={{ opacity: state === "idle" ? 0 : 1, transition: "opacity 200ms" }}
      >
        {state !== "idle" && <div className="nav-progress h-full bg-foreground" />}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {state === "slow" ? "Still loading the page…" : ""}
      </p>
      {state === "slow" && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex justify-center">
          <span className="bg-foreground px-3 py-1.5 text-[0.75rem] text-background shadow-card">
            Still loading…
          </span>
        </div>
      )}
    </>
  );
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
