/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import * as React from "react";
import { css } from "@flow-css/core/css";
import globalCss from "~/global.css?url";
import { getSession, isSetupRequired } from "~/auth";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
    links: [{ rel: "stylesheet", href: globalCss }],
  }),
  beforeLoad: async ({ location }) => {
    const user = await getSession();
    const needsSetup = await isSetupRequired();

    // First-run setup gate: if no users exist yet, force visitors to /setup.
    // Once setup is complete, /setup itself bounces away.
    if (needsSetup && location.pathname !== "/setup") {
      throw redirect({ to: "/setup" });
    }
    if (!needsSetup && location.pathname === "/setup") {
      throw redirect({ to: user ? "/" : "/login" });
    }

    return { user };
  },
  shellComponent: RootDocument,
});

function LoadingBar() {
  const status = useRouterState({ select: (s) => s.status });
  if (status === "idle") return null;
  return (
    <>
      <style>{`@keyframes nanomail-loading-grow { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }`}</style>
      <div
        className={css({
          position: "fixed",
          top: "0",
          left: "0",
          right: "0",
          height: "3px",
          background: "#0066cc",
          transformOrigin: "left",
          animation: "nanomail-loading-grow 800ms ease-out forwards",
          zIndex: "9999",
        })}
      />
    </>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <LoadingBar />
        {children}
        <Scripts />
      </body>
    </html>
  );
}
