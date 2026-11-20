"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, ErrorBanner, Field, Input } from "@/components/ui";
import { api, DEMO_ACCOUNTS, errorMessage } from "@/lib/data";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in? Go straight to the app.
  useEffect(() => {
    let active = true;
    api.auth.me().then((user) => {
      if (active && user) router.replace("/pos");
    });
    return () => {
      active = false;
    };
  }, [router]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.auth.login(email, password);
      router.replace("/pos");
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-indigo-600 text-lg font-semibold text-white">
            R
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900">
            Retail Manager
          </h1>
          <p className="mt-1 text-sm text-zinc-500">Sign in to your store account</p>
        </div>

        <Card className="p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <ErrorBanner message={error} />
            <Field label="Email">
              <Input
                type="email"
                autoComplete="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Demo accounts
          </p>
          <ul className="mt-2 space-y-1">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(account.password);
                  }}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-zinc-100"
                >
                  <span className="font-medium text-zinc-900">{account.label}</span>
                  <span className="block text-xs text-zinc-500">
                    {account.email} / {account.password}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </main>
  );
}
