import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { AuthenticationUnavailable } from "@/components/auth/authentication-unavailable";
import { AccountSettingsClient } from "@/components/account/account-settings-client";
import { requirePageAuthentication } from "@/lib/auth/page";

export const metadata: Metadata = { title: "Account" };

export default async function AccountSettingsPage() {
  const user = await requirePageAuthentication("/settings/account");
  if ("status" in user) {
    return <AuthenticationUnavailable retryHref="/settings/account" />;
  }
  return (
    <main id="main-content" className="min-h-[100dvh] bg-canvas px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
          <ArrowLeft size={16} aria-hidden="true" />
          Dashboard
        </Link>
        <p className="mt-8 font-sans text-[10px] uppercase  text-accent">Workspace settings</p>
        <h1 className="mt-2 text-4xl font-semibold ">Your account</h1>
        <AccountSettingsClient name={user.name ?? ""} email={user.email ?? ""} emailVerified={Boolean(user.emailVerified)} />
      </div>
    </main>
  );
}
