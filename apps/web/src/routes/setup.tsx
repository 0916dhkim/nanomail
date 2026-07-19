import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { css } from "@flow-css/core/css";
import { useState } from "react";
import { setupAdminFn } from "~/auth";

export const Route = createFileRoute("/setup")({
  component: SetupPage,
});

function SetupPage() {
  const [error, setError] = useState<string>();
  const navigate = useNavigate();

  return (
    <div
      className={css({
        maxWidth: "400px",
        margin: "4rem auto",
        padding: "2rem",
      })}
    >
      <h1 className={css({ fontSize: "1.5rem", marginBottom: "1.5rem" })}>
        Create Admin Account
      </h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError(undefined);
          const form = new FormData(e.currentTarget);
          const password = form.get("password") as string;
          const confirm = form.get("confirm") as string;
          if (password !== confirm) {
            setError("Passwords do not match");
            return;
          }
          const result = await setupAdminFn({
            data: {
              email: form.get("email") as string,
              password,
            },
          });
          if ("error" in result) {
            setError(result.error);
          } else {
            navigate({ to: "/" });
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
        <label className={css({ display: "block", marginBottom: "1rem" })}>
          Confirm Password
          <input
            name="confirm"
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
        <button
          type="submit"
          className={css({ padding: "0.5rem 1rem", cursor: "pointer" })}
        >
          Create Admin Account
        </button>
      </form>
    </div>
  );
}
