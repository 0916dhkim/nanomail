import { createFileRoute, redirect } from "@tanstack/react-router";
import { css } from "@flow-css/core/css";
import { useState } from "react";
import { createUserFn } from "~/auth";

export const Route = createFileRoute("/_authed/admin")({
  beforeLoad: async ({ context }) => {
    if (!context.user.isAdmin) {
      throw redirect({ to: "/" });
    }
  },
  component: AdminPage,
});

function AdminPage() {
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  return (
    <div
      className={css({
        maxWidth: "400px",
        margin: "2rem auto",
        padding: "2rem",
      })}
    >
      <h1 className={css({ fontSize: "1.5rem", marginBottom: "1.5rem" })}>
        Create Account
      </h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError(undefined);
          setSuccess(undefined);
          const form = new FormData(e.currentTarget);
          const result = await createUserFn({
            data: {
              email: form.get("email") as string,
              password: form.get("password") as string,
            },
          });
          if ("error" in result) {
            setError(result.error);
          } else {
            setSuccess(`Account created for ${form.get("email")}`);
            e.currentTarget.reset();
          }
        }}
      >
        <label className={css({ display: "block", marginBottom: "1rem" })}>
          Email
          <input
            name="email"
            type="email"
            required
            className={css({
              display: "block",
              width: "100%",
              padding: "0.5rem",
              marginTop: "0.25rem",
            })}
          />
        </label>
        <label className={css({ display: "block", marginBottom: "1rem" })}>
          Password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className={css({
              display: "block",
              width: "100%",
              padding: "0.5rem",
              marginTop: "0.25rem",
            })}
          />
        </label>
        {error && (
          <p className={css({ color: "red", marginBottom: "1rem" })}>
            {error}
          </p>
        )}
        {success && (
          <p className={css({ color: "green", marginBottom: "1rem" })}>
            {success}
          </p>
        )}
        <button
          type="submit"
          className={css({ padding: "0.5rem 1rem", cursor: "pointer" })}
        >
          Create Account
        </button>
      </form>
    </div>
  );
}
