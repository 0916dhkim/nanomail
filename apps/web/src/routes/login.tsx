import { createFileRoute } from "@tanstack/react-router";
import { css } from "@flow-css/core/css";
import { useState } from "react";
import { loginFn } from "~/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const [error, setError] = useState<string>();

  return (
    <div
      className={css({
        maxWidth: "400px",
        margin: "4rem auto",
        padding: "2rem",
      })}
    >
      <h1 className={css({ fontSize: "1.5rem", marginBottom: "1.5rem" })}>
        Log in
      </h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError(undefined);
          const form = new FormData(e.currentTarget);
          const result = await loginFn({
            data: {
              email: form.get("email") as string,
              password: form.get("password") as string,
            },
          });
          if (result?.error) setError(result.error);
        }}
      >
        <label
          className={css({ display: "block", marginBottom: "1rem" })}
        >
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
        <label
          className={css({ display: "block", marginBottom: "1rem" })}
        >
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
        <button
          type="submit"
          className={css({
            padding: "0.5rem 1rem",
            cursor: "pointer",
          })}
        >
          Log in
        </button>
      </form>
    </div>
  );
}
