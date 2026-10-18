"use client";

import { useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import type { BillingInterval } from "@/lib/pricing";

export function CheckoutButton({
  label = "Start Pro",
  plan = "pro",
  variant = "primary",
  billingInterval = "monthly",
}: {
  label?: string;
  plan?: "pro" | "pro_lite";
  variant?: "primary" | "secondary";
  billingInterval?: BillingInterval;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function checkout() {
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/paddle/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, billingInterval }),
      });
      const data = (await response.json()) as {
        url?: string;
        error?: string;
        loginUrl?: string;
        manageUrl?: string;
      };
      if (response.status === 401) {
        window.location.href = data.loginUrl ?? "/login?next=/pricing";
        return;
      }
      if (response.status === 409 && data.manageUrl) {
        window.location.href = data.manageUrl;
        return;
      }
      if (!response.ok || !data.url) {
        throw new Error(
          data.error || "Billing is unavailable. Please try again later.",
        );
      }
      window.location.href = data.url;
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Checkout could not start.",
      );
    }
  }

  return (
    <div>
      <Button
        size="lg"
        variant={variant}
        onClick={checkout}
        disabled={status === "loading"}
        aria-busy={status === "loading"}
        className="w-full"
      >
        {status === "loading" ? (
          <LoadingIndicator size="sm" />
        ) : (
          <ArrowRight aria-hidden="true" size={18} />
        )}
        {status === "loading" ? "Opening checkout" : label}
      </Button>
      {status === "error" && (
        <p role="alert" className="mt-3 max-w-sm text-xs leading-5 text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
