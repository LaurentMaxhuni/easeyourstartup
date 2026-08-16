"use client";

import { useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";

export function CheckoutButton({
  label = "Start Pro",
}: {
  label?: string;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function checkout() {
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await response.json()) as {
        url?: string;
        error?: string;
        loginUrl?: string;
      };
      if (response.status === 401) {
        window.location.href = data.loginUrl ?? "/login?next=/pricing";
        return;
      }
      if (!response.ok || !data.url) {
        throw new Error(
          data.error ||
            "Billing is not connected yet. Join the founder beta instead.",
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
        onClick={checkout}
        disabled={status === "loading"}
        className="w-full sm:w-auto"
      >
        {status === "loading" ? (
          <LoadingIndicator size="sm" />
        ) : (
          <ArrowRight size={18} />
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
