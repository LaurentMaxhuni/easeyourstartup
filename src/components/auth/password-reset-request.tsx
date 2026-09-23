"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

export function PasswordResetRequest() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (result.error) throw new Error(result.error.message);
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Password reset could not be requested.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <p role="status" className="mt-5 text-sm leading-6 text-muted">If an account uses that email, a password reset link will arrive shortly.</p>;

  return (
    <form onSubmit={submit} className="mt-6">
      <label htmlFor="reset-email" className="text-xs font-semibold">Email address</label>
      <Input id="reset-email" className="mt-2" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      <Button className="mt-5 w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </form>
  );
}
