"use client";

/**
 * The sign-in form.
 *
 * React Hook Form + Zod for the two things that must happen before a request is
 * made: a field is required, and an email looks like one. Neither is a
 * *permission* decision — the backend still validates everything — but a round
 * trip to be told "this is not an email" is a slow way to say something the
 * browser already knew.
 *
 * The submit is a real Server Action call rather than a `fetch`: the token is
 * written to an `httpOnly` cookie inside the action, so it never exists in
 * JavaScript on this side (D5).
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { login } from "@/app/actions/auth/login";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TextField } from "@/components/ui/text-field";
import { failureMessage } from "@/lib/messages";

const schema = z.object({
  email: z.email("That email address is not valid."),
  password: z.string().min(8, "A password must be at least 8 characters."),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  function onSubmit(values: FormValues) {
    setServerError(null);

    startTransition(async () => {
      const result = await login(values);

      if (!result.success) {
        setServerError(failureMessage(result.error));
        return;
      }

      // One full document request, not `refresh()` + `replace()`.
      //
      // Those two calls start two RSC requests at once, and Next 16.4's
      // Turbopack flight client corrupts its chunk state when that happens
      // (`chunk.reason.enqueueModel is not a function`). A document navigation
      // also guarantees the server sees the cookie that was just written, so
      // no signed-out tree can come out of the router cache.
      //
      // `replace`, not `assign`: the login form is not a place Back should
      // return to once a session exists.
      window.location.replace(redirectTo);
    });
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-[var(--space-lg)]"
    >
      {serverError ? (
        <div
          role="alert"
          className="flex items-start gap-[var(--space-sm)] rounded-[var(--radius-md)] bg-danger-soft px-[var(--space-md)] py-[var(--space-sm)] text-danger"
        >
          <Icon name="error" size="sm" className="mt-[2px] shrink-0" />
          <p className="type-caption">{serverError}</p>
        </div>
      ) : null}

      <TextField
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        dir="ltr"
        placeholder="you@example.com"
        error={form.formState.errors.email?.message}
        {...form.register("email")}
      />

      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        error={form.formState.errors.password?.message}
        {...form.register("password")}
      />

      <Button type="submit" variant="primary" size="lg" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
