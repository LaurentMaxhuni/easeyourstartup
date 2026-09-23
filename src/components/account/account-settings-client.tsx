"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DownloadSimple, Check, SignOut, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

export function AccountSettingsClient({
  name,
  email,
  emailVerified,
}: {
  name: string;
  email: string;
  emailVerified: boolean;
}) {
  const [newName, setNewName] = useState(name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [deletionPending, setDeletionPending] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/account/deletion", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ pending?: boolean }> : null)
      .then((result) => { if (active) setDeletionPending(result?.pending === true); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await authClient.updateUser({ name: newName.trim() });
      if (result.error) throw new Error(result.error.message);
      setMessage("Account details saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Account details could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: `${window.location.origin}/dashboard`,
      });
      if (result.error) throw new Error(result.error.message);
      setMessage("Verification email sent. Check your inbox.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verification email could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (!window.confirm("Permanently delete your account and all saved projects, campaigns, and uploaded images? This cannot be undone.")) return;
    setBusy(true);
    setMessage("");
    setError("");
    let deletionPrepared = false;
    try {
      const prepared = await fetch("/api/account/deletion", { method: "POST" });
      const preparation = await prepared.json() as { error?: string; manageUrl?: string };
      if (!prepared.ok) {
        if (preparation.manageUrl) window.location.assign(preparation.manageUrl);
        throw new Error(preparation.error || "Account deletion could not be prepared.");
      }
      deletionPrepared = true;
      const result = await authClient.deleteUser({
        ...(currentPassword.trim() ? { password: currentPassword } : {}),
        callbackURL: `${window.location.origin}/`,
      });
      if (result.error) throw new Error(result.error.message);
      if (result.data?.message === "Verification email sent") {
        setCurrentPassword("");
        setDeletionPending(true);
        setMessage("Confirm account deletion using the link in your email. Checkout stays paused for up to 24 hours while you decide.");
        return;
      }
      window.location.assign("/");
    } catch (cause) {
      if (deletionPrepared) {
        await fetch("/api/account/deletion", { method: "DELETE" }).catch(() => undefined);
        setDeletionPending(false);
      }
      setError(cause instanceof Error ? cause.message : "Account deletion could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelDeletion() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/account/deletion", { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "The account deletion request could not be cancelled.");
      setDeletionPending(false);
      setMessage("Account deletion request cancelled.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The account deletion request could not be cancelled.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="mt-7 rounded-container border border-line bg-surface-raised p-6 sm:p-8">
        <h2 className="text-lg font-semibold">Profile</h2>
        <form className="mt-5 max-w-lg" onSubmit={saveName}>
          <label className="block text-xs font-semibold" htmlFor="account-name">Name</label>
          <Input id="account-name" className="mt-2" value={newName} maxLength={120} onChange={(event) => setNewName(event.target.value)} />
          <label className="mt-4 block text-xs font-semibold" htmlFor="account-email">Email</label>
          <Input id="account-email" className="mt-2" value={email} readOnly />
          {emailVerified ? (
            <p className="mt-2 flex items-center gap-1 text-xs text-accent"><Check size={14} /> Email verified</p>
          ) : (
            <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={resendVerification} disabled={busy}>Resend verification email</Button>
          )}
          <Button className="mt-5" type="submit" disabled={busy || !newName.trim()}>{busy ? "Saving…" : "Save account details"}</Button>
        </form>
      </section>

      <section className="mt-4 rounded-container border border-line bg-surface-raised p-6 sm:p-8">
        <h2 className="text-lg font-semibold">Account data</h2>
        <p className="mt-2 text-sm leading-6 text-muted">Download your account profile, projects, Brand DNA, campaign copy, saved editor states, and job history as JSON.</p>
        <Button asChild variant="secondary" className="mt-4"><a href="/api/account/export"><DownloadSimple size={16} />Export account data</a></Button>
      </section>

      <section className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-container border border-line bg-surface-raised p-6 sm:p-8">
        <div><h2 className="text-lg font-semibold">Sign out</h2><p className="mt-1 text-sm text-muted">End this session on this device.</p></div>
        <Button variant="secondary" onClick={async () => { await authClient.signOut(); window.location.assign("/"); }}><SignOut size={16} />Sign out</Button>
      </section>
      <section className="mt-4 rounded-container border border-danger/40 bg-surface-raised p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-danger">Delete account</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          This permanently deletes your account, workspace, projects, campaigns, and uploaded images, and signs out your sessions. Cancel any subscription and wait until the paid period ends first. Active jobs must also finish.
        </p>
        <label className="mt-5 block max-w-sm text-xs font-semibold" htmlFor="delete-account-password">Current password, if you use one</label>
        <Input id="delete-account-password" className="mt-2 max-w-sm" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        <p className="mt-2 text-xs leading-5 text-muted">Google sign-in accounts can leave this blank; the authentication service may ask you to sign in again.</p>
        <Button variant="danger" className="mt-4" type="button" onClick={deleteAccount} disabled={busy}>
          <Trash size={16} />{busy ? "Deleting…" : "Permanently delete account"}
        </Button>
        {deletionPending && (
          <div className="mt-5 rounded-control border border-line p-4">
            <p className="text-sm font-semibold">Deletion confirmation is pending</p>
            <p className="mt-1 text-xs leading-5 text-muted">Your workspace cannot start checkout while this request is open. Cancel it here if you changed your mind.</p>
            <Button className="mt-3" variant="secondary" size="sm" type="button" onClick={() => void cancelDeletion()} disabled={busy}>Cancel deletion request</Button>
          </div>
        )}
      </section>
      {(message || error) && <p role={error ? "alert" : "status"} className={`mt-4 text-sm ${error ? "text-danger" : "text-accent"}`}>{error || message}</p>}
    </>
  );
}
