import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getSession } from "~/auth";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async () => {
    const user = await getSession();
    if (!user) {
      throw redirect({ to: "/login" });
    }
    return { user };
  },
  component: () => <Outlet />,
});
