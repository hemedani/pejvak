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
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { login } from "@/app/actions/auth/login";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TextField } from "@/components/ui/text-field";
import { failureMessage } from "@/lib/messages";

const schema = z.object({
  email: z.email("ایمیل معتبر نیست."),
  password: z.string().min(8, "رمز عبور باید حداقل ۸ نویسه باشد."),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
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

      // `refresh()` before `replace()` so the shell's `getMe` runs with the new
      // cookie. Without it the router can reuse a cached tree rendered while
      // signed out, and the dashboard arrives empty.
      router.refresh();
      router.replace(redirectTo);
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
        label="ایمیل"
        type="email"
        inputMode="email"
        autoComplete="email"
        dir="ltr"
        placeholder="you@example.com"
        error={form.formState.errors.email?.message}
        {...form.register("email")}
      />

      <TextField
        label="رمز عبور"
        type="password"
        autoComplete="current-password"
        error={form.formState.errors.password?.message}
        {...form.register("password")}
      />

      <Button type="submit" variant="primary" size="lg" disabled={pending}>
        {pending ? "در حال ورود…" : "ورود"}
      </Button>
    </form>
  );
}
