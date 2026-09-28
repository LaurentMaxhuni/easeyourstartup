"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { GoogleIcon } from "@neondatabase/auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { authClient } from "@/lib/auth/client";
import {
  redirectAfterAuthentication,
  redirectToAuthenticationProvider,
} from "@/lib/auth/navigation";

type FormMode = "sign-in" | "sign-up";
type FormStatus = "idle" | "loading" | "error" | "info";

function getPostAuthenticationPath(nextPath: string) {
  const search = new URLSearchParams({ next: nextPath });
  return "/onboarding?" + search.toString();
}

export function SignInForm({ nextPath }: { nextPath: string }) {
  const [mode, setMode] = useState<FormMode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [message, setMessage] = useState("");
  const [resendAvailable, setResendAvailable] = useState(false);

  function setFormMode(nextMode: FormMode) {
    setMode(nextMode);
    setStatus("idle");
      setMessage("");
      setResendAvailable(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const result =
        mode === "sign-in"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({
              email,
              password,
              name: name.trim(),
              callbackURL: getPostAuthenticationPath(nextPath),
            });
      if (result.error) throw new Error(result.error.message);

      const session = await authClient.getSession();
      if (session.error) throw new Error(session.error.message);
      if (!session.data?.user) {
        setStatus(mode === "sign-up" ? "info" : "error");
        setMessage(
          mode === "sign-up"
            ? "Check your email to verify your account before signing in."
            : "Your session could not be established. Please try again.",
        );
        setResendAvailable(mode === "sign-up");
        return;
      }

      redirectAfterAuthentication(getPostAuthenticationPath(nextPath));
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Authentication failed.",
      );
    }
  }

  async function continueWithGoogle() {
    setStatus("loading");
    setMessage("");
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}${getPostAuthenticationPath(nextPath)}`,
      });
      if (result.error) throw new Error(result.error.message);
      const providerUrl = result.data?.url;
      if (!providerUrl) {
        throw new Error("Google sign-in could not be started.");
      }
      redirectToAuthenticationProvider(providerUrl);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Google sign-in failed.",
      );
    }
  }

  const isSignIn = mode === "sign-in";

  return (
    <div>
      <div className="grid grid-cols-2 rounded-control border border-line bg-canvas p-1">
        <button
          type="button"
          onClick={() => setFormMode("sign-in")}
          className={`rounded-[6px] px-3 py-2 text-sm font-semibold transition-colors ${
            isSignIn ? "bg-surface-raised text-ink shadow-sm" : "text-muted"
          }`}
          aria-pressed={isSignIn}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setFormMode("sign-up")}
          className={`rounded-[6px] px-3 py-2 text-sm font-semibold transition-colors ${
            !isSignIn ? "bg-surface-raised text-ink shadow-sm" : "text-muted"
          }`}
          aria-pressed={!isSignIn}
        >
          Create account
        </button>
      </div>

      <form className="mt-6" onSubmit={submit}>
        {!isSignIn && (
          <label className="block text-sm font-semibold" htmlFor="name">
            Name
            <Input
              id="name"
              className="mt-2"
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
            />
          </label>
        )}
        <label
          className={`block text-sm font-semibold ${!isSignIn ? "mt-4" : ""}`}
          htmlFor="email"
        >
          Email address
          <Input
            id="email"
            className="mt-2"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="founder@company.com"
          />
        </label>
        <label className="mt-4 block text-sm font-semibold" htmlFor="password">
          Password
          <Input
            id="password"
            className="mt-2"
            type="password"
            required
            minLength={8}
            autoComplete={isSignIn ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
          />
        </label>
        <Button
          type="submit"
          size="lg"
          className="mt-5 w-full"
          disabled={status === "loading"}
        >
          {status === "loading" ? (
            <LoadingIndicator size="sm" />
          ) : null}
          {isSignIn ? "Sign in" : "Create account"}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        <span>or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        onClick={continueWithGoogle}
        disabled={status === "loading"}
      >
        <GoogleIcon className="size-[18px]" aria-hidden="true" />
        Continue with Google
      </Button>

      {message && (
        <p
          role="alert"
          className={`mt-4 text-sm leading-6 ${
            status === "error" ? "text-danger" : "text-muted"
          }`}
        >
          {message}
        </p>
      )}
      {isSignIn && (
        <Link href="/forgot-password" className="mt-4 inline-block text-xs font-semibold text-accent underline underline-offset-4">Forgot password?</Link>
      )}
      {resendAvailable && (
        <button
          type="button"
          className="mt-3 block text-xs font-semibold text-accent underline underline-offset-4"
          onClick={async () => {
            setStatus("loading");
            try {
              const result = await authClient.sendVerificationEmail({ email, callbackURL: `${window.location.origin}${getPostAuthenticationPath(nextPath)}` });
              if (result.error) throw new Error(result.error.message);
              setStatus("info");
              setMessage("Verification email sent. Check your inbox.");
            } catch (error) {
              setStatus("error");
              setMessage(error instanceof Error ? error.message : "Verification email could not be sent.");
            }
          }}
        >
          Resend verification email
        </button>
      )}
    </div>
  );
}
