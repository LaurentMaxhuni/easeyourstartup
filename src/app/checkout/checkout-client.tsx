"use client";

import Script from "next/script";
import { useState } from "react";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    Paddle?: {
      Initialize: (options: {
        token: string;
        eventCallback: (event: { name: string }) => void;
      }) => void;
      Environment?: { set: (environment: "sandbox") => void };
    };
  }
}

export function CheckoutClient() {
  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const environment = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT;
  const [ready, setReady] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  function initialize() {
    if (!token || !window.Paddle) {
      setError("Paddle checkout could not be loaded. Return to pricing and try again.");
      return;
    }
    try {
      if (environment === "sandbox") window.Paddle.Environment?.set("sandbox");
      window.Paddle.Initialize({
        token,
        eventCallback: (event) => {
          if (event.name === "checkout.completed") setComplete(true);
        },
      });
      setReady(true);
    } catch {
      setError("Paddle checkout could not be initialized. Return to pricing and try again.");
    }
  }

  return (
    <div className="rounded-container border border-line bg-surface-raised p-6 sm:p-8">
      {!token ? (
        <p role="alert" className="text-sm text-danger">Paddle checkout is not configured for this app.</p>
      ) : (
        <>
          <Script
            src="https://cdn.paddle.com/paddle/v2/paddle.js"
            strategy="afterInteractive"
            onReady={initialize}
            onError={() => setError("Paddle checkout could not be loaded. Return to pricing and try again.")}
          />
          {complete ? (
            <div role="status">
              <h1 className="text-xl font-semibold">Payment received</h1>
              <p className="mt-2 text-sm leading-6 text-muted">
                Paddle is confirming your subscription. Your Pro access will appear in the studio when confirmation arrives.
              </p>
              <Button className="mt-5" onClick={() => { window.location.assign("/studio?checkout=success"); }}>
                Continue to studio
              </Button>
            </div>
          ) : (
            <div role="status" aria-live="polite">
              <p className="text-sm font-medium">{ready ? "Opening secure Paddle checkout…" : "Loading secure checkout…"}</p>
              <p className="mt-2 text-xs leading-5 text-muted">Your payment details are handled by Paddle.</p>
            </div>
          )}
          {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
        </>
      )}
    </div>
  );
}
