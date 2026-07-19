import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { css } from "@flow-css/core/css";
import { useState } from "react";
import { sendEmailFn } from "~/server/api/send";

export const Route = createFileRoute("/_authed/compose")({
  component: ComposePage,
});

function ComposePage() {
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const navigate = useNavigate();

  return (
    <div
      className={css({
        padding: "2rem",
        maxWidth: "800px",
        margin: "0 auto",
      })}
    >
      <a
        href="/"
        className={css({
          display: "inline-block",
          marginBottom: "1rem",
          color: "#0066cc",
          textDecoration: "none",
        })}
      >
        &larr; Back to inbox
      </a>
      <h1 className={css({ fontSize: "1.5rem", marginBottom: "1.5rem" })}>
        New email
      </h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError(undefined);
          setSending(true);
          const form = new FormData(e.currentTarget);
          const result = await sendEmailFn({
            data: {
              to: form.get("to") as string,
              subject: form.get("subject") as string,
              bodyText: form.get("body") as string,
            },
          });
          setSending(false);
          if ("error" in result) {
            setError(result.error);
          } else {
            navigate({ to: "/" });
          }
        }}
        className={css({
          padding: "1rem",
          border: "1px solid #eee",
          borderRadius: "4px",
        })}
      >
        <label className={css({ display: "block", marginBottom: "0.5rem" })}>
          To
          <input
            name="to"
            type="email"
            required
            className={css({
              display: "block",
              width: "100%",
              padding: "0.5rem",
              marginTop: "0.25rem",
              border: "1px solid #ccc",
              borderRadius: "4px",
            })}
          />
        </label>
        <label className={css({ display: "block", marginBottom: "0.5rem" })}>
          Subject
          <input
            name="subject"
            type="text"
            required
            className={css({
              display: "block",
              width: "100%",
              padding: "0.5rem",
              marginTop: "0.25rem",
              border: "1px solid #ccc",
              borderRadius: "4px",
            })}
          />
        </label>
        <label className={css({ display: "block", marginBottom: "0.5rem" })}>
          Body
          <textarea
            name="body"
            required
            rows={12}
            className={css({
              display: "block",
              width: "100%",
              padding: "0.5rem",
              marginTop: "0.25rem",
              border: "1px solid #ccc",
              borderRadius: "4px",
              fontFamily: "inherit",
            })}
          />
        </label>
        {error && (
          <p className={css({ color: "red", marginBottom: "0.5rem" })}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={sending}
          className={css({
            padding: "0.5rem 1rem",
            cursor: "pointer",
            background: "#0066cc",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
          })}
          style={sending ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
