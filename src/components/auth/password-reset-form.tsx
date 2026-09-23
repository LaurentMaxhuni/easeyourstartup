"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

export function PasswordResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) throw new Error(result.error.message);
      router.replace("/login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Password reset could not be completed.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6">
      <label htmlFor="new-password" className="text-xs font-semibold">New password</label>
      <Input id="new-password" className="mt-2" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
      <Button className="mt-5 w-full" disabled={busy}>{busy ? "Updating…" : "Update password"}</Button>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </form>
  );
}
