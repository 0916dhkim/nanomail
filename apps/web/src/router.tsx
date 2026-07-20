import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createRouter({
    routeTree,
    defaultPreload: false,
    scrollRestoration: true,
    // Show pending state (e.g. loading bar) only if a loader takes longer
    // than 50ms. Below that, the transition is instant — no flicker.
    defaultPendingMs: 50,
  });
  return router;
}
