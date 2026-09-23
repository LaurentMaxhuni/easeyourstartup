import type { Metadata } from "next";
import Link from "next/link";
import { AccountSettingsClient } from "@/components/account/account-settings-client";
import { requirePageAuthentication } from "@/lib/auth/page";

export const metadata: Metadata = { title: "Account" };

export default async function AccountSettingsPage() {
  const user = await requirePageAuthentication("/settings/account");
  return (
    <main id="main-content" className="min-h-[100dvh] bg-canvas px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/dashboard" className="text-sm font-semibold text-accent">← Dashboard</Link>
        <p className="mt-8 font-sans text-[10px] uppercase tracking-[0.16em] text-accent">Workspace settings</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.06em]">Your account</h1>
        <AccountSettingsClient name={user.name ?? ""} email={user.email ?? ""} emailVerified={Boolean(user.emailVerified)} />
      </div>
    </main>
  );
}
