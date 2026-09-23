"use client";

import { useState } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";

export function BillingPortalButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openPortal() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/paddle/portal", { method: "POST" });
      const result = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !result.url) {
        throw new Error(result.error || "Billing settings could not be opened.");
      }
      window.location.assign(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Billing settings could not be opened.");
      setLoading(false);
    }
  }

  return (
    <div>
      <Button type="button" variant="secondary" onClick={openPortal} disabled={loading}>
        {loading ? <LoadingIndicator size="sm" /> : <ArrowSquareOut size={16} />}
        {loading ? "Opening billing" : "Manage subscription"}
      </Button>
      {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
    </div>
  );
}
