/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  redirect,
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

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
