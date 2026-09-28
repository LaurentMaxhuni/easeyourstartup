"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Buildings, Check, GlobeSimple, RocketLaunch, ShareNetwork, UserCircle, X } from "@phosphor-icons/react";
import { onboardingSubmissionSchema, type OnboardingSubmission } from "@/lib/onboarding";
import { normalizePublicWebsiteUrl } from "@/lib/url-input";
import { cn } from "@/lib/utils";

const STEP_COUNT = 5;

const roles: Array<{ value: OnboardingSubmission["role"]; label: string }> = [
  { value: "founder", label: "Founder or owner" },
  { value: "marketing", label: "Marketing or growth" },
  { value: "product", label: "Product or engineering" },
  { value: "other", label: "Something else" },
];

const launchGoals: Array<{ value: OnboardingSubmission["launchGoal"]; label: string }> = [
  { value: "new_product", label: "Launch a new product" },
  { value: "product_update", label: "Share a product update" },
  { value: "waitlist", label: "Grow a waitlist" },
  { value: "milestone", label: "Share a company milestone" },
];

const channels: Array<{ value: OnboardingSubmission["channels"][number]; label: string }> = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X" },
  { value: "product_hunt", label: "Product Hunt" },
  { value: "reddit", label: "Reddit" },
  { value: "hacker_news", label: "Hacker News" },
  { value: "instagram", label: "Instagram" },
  { value: "threads", label: "Threads" },
  { value: "facebook", label: "Facebook" },
  { value: "email", label: "Email" },
];

const stepCopy = [
  { title: "Name your organization", description: "What should we call your team or company?" },
  { title: "Add your website", description: "We’ll use your public site as a starting point for your first launch." },
  { title: "What’s your role?", description: "Choose the closest fit. You can change this later." },
  { title: "What are you launching?", description: "Pick the kind of announcement you’re working toward." },
  { title: "Where will you share it?", description: "Choose the channels you use most. You can change this later." },
];

function optionClasses(selected: boolean) {
  return cn(
    "flex min-h-12 w-full items-center justify-between gap-3 rounded-control border px-3.5 py-3 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-[#93b5ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#202124]",
    selected
      ? "border-[#d8e2ff] bg-[#292c33] text-white"
      : "border-[#44464b] bg-[#1c1d20] text-[#d3d5d8] hover:border-[#777b83] hover:bg-[#24262a]",
  );
}

export function OnboardingWizard({ nextPath }: { nextPath: string }) {
  const [step, setStep] = useState(0);
  const [organizationName, setOrganizationName] = useState("");
  const [website, setWebsite] = useState("");
  const [role, setRole] = useState<OnboardingSubmission["role"] | null>(null);
  const [launchGoal, setLaunchGoal] = useState<OnboardingSubmission["launchGoal"] | null>(null);
  const [selectedChannels, setSelectedChannels] = useState<OnboardingSubmission["channels"]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function toggleChannel(channel: OnboardingSubmission["channels"][number]) {
    setSelectedChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (step === 0 && !organizationName.trim()) {
      setError("Add a name for your team or company to continue.");
      return;
    }

    if (step === 1 && website.trim()) {
      const normalized = normalizePublicWebsiteUrl(website);
      if (!normalized) {
        setError("Enter a valid website, such as yourcompany.com.");
        return;
      }
      setWebsite(normalized);
    }

    if (step === 2 && !role) {
      setError("Choose the role that fits you best.");
      return;
    }

    if (step === 3 && !launchGoal) {
      setError("Choose the launch you’re working toward.");
      return;
    }

    if (step < STEP_COUNT - 1) {
      setStep((current) => current + 1);
      return;
    }

    const parsed = onboardingSubmissionSchema.safeParse({
      organizationName,
      websiteUrl: normalizePublicWebsiteUrl(website),
      role,
      launchGoal,
      channels: selectedChannels,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your setup and try again.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string; completed?: boolean }
        | null;
      if (!response.ok || !result?.completed) {
        throw new Error(result?.error ?? "Your setup could not be saved. Try again.");
      }
      window.location.assign(nextPath);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Your setup could not be saved. Try again.",
      );
      setSaving(false);
    }
  }

  const copy = stepCopy[step];

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#202124] text-[#f4f5f7]">
      <Link
        href="/"
        aria-label="Exit onboarding"
        className="absolute left-5 top-5 z-10 inline-flex size-9 items-center justify-center rounded-full text-[#979aa0] transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-[#93b5ff] sm:left-7 sm:top-7"
      >
        <X size={18} aria-hidden="true" />
      </Link>

      <svg
        aria-hidden="true"
        viewBox="0 0 96 96"
        className="pointer-events-none absolute right-7 top-7 hidden size-24 text-[#9bb8f4]/40 sm:block"
        fill="none"
      >
        <path d="M18 81V23a4 4 0 0 1 4-4h27a4 4 0 0 1 4 4v58" stroke="currentColor" />
        <path d="M27 28h17M27 36h17M27 44h17M27 52h17M27 60h17M27 68h17" stroke="currentColor" strokeWidth="1.2" />
        <path d="M13 81h48M61 32h14v49M68 25h12v6M80 39h7M80 47h7M80 55h7M80 63h7M80 71h7" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="70" cy="16" r="1.5" fill="currentColor" />
        <circle cx="82" cy="16" r="1.5" fill="currentColor" />
        <circle cx="88" cy="22" r="1.5" fill="currentColor" />
        <circle cx="88" cy="31" r="1.5" fill="currentColor" />
      </svg>

      <div className="mx-auto grid min-h-[100dvh] max-w-[1344px] grid-cols-1 items-center px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.86fr)] lg:py-12">
        <section className="w-full max-w-[400px]" aria-labelledby="onboarding-title">
          <ol
            className="grid grid-cols-5 gap-1.5"
            aria-label={"Step " + (step + 1) + " of " + STEP_COUNT}
          >
            {stepCopy.map((item, index) => (
              <li
                key={item.title}
                aria-current={index === step ? "step" : undefined}
                className={cn(
                  "h-1 rounded-full transition-colors",
                  index <= step ? "bg-[#f0f1f3]" : "bg-[#3a3c41]",
                )}
              />
            ))}
          </ol>

          <p className="sr-only" aria-live="polite">
            Step {step + 1} of {STEP_COUNT}: {copy.title}
          </p>

          <div className="mt-8 flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-control bg-[#282b31] text-[#b9cafa]">
              {step === 0 ? <Buildings size={18} aria-hidden="true" /> : null}
              {step === 1 ? <GlobeSimple size={18} aria-hidden="true" /> : null}
              {step === 2 ? <UserCircle size={18} aria-hidden="true" /> : null}
              {step === 3 ? <RocketLaunch size={18} aria-hidden="true" /> : null}
              {step === 4 ? <ShareNetwork size={18} aria-hidden="true" /> : null}
            </span>
            <div>
              <h1 id="onboarding-title" className="text-lg font-semibold ">
                {copy.title}
              </h1>
              <p className="mt-0.5 text-sm leading-5 text-[#aeb1b7]">{copy.description}</p>
            </div>
          </div>

          <form className="mt-6" onSubmit={submit}>
            {step === 0 ? (
              <label className="block text-xs font-medium text-[#d8dade]" htmlFor="organization-name">
                Name
                <input
                  id="organization-name"
                  autoFocus
                  autoComplete="organization"
                  maxLength={120}
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  placeholder="Your team or company"
                  className="mt-1.5 h-10 w-full rounded-control border border-[#62656b] bg-[#17181a] px-3 text-sm text-white placeholder:text-[#73767c] focus-visible:border-[#b9cafa]"
                />
              </label>
            ) : null}

            {step === 1 ? (
              <label className="block text-xs font-medium text-[#d8dade]" htmlFor="website-url">
                Website <span className="font-normal text-[#898c92]">(optional)</span>
                <input
                  id="website-url"
                  autoFocus
                  autoComplete="url"
                  inputMode="url"
                  maxLength={2048}
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  placeholder="yourcompany.com"
                  className="mt-1.5 h-10 w-full rounded-control border border-[#62656b] bg-[#17181a] px-3 text-sm text-white placeholder:text-[#73767c] focus-visible:border-[#b9cafa]"
                />
              </label>
            ) : null}

            {step === 2 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Choose your role">
                {roles.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={role === option.value}
                    onClick={() => setRole(option.value)}
                    className={optionClasses(role === option.value)}
                  >
                    {option.label}
                    {role === option.value ? <Check size={16} aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Choose your launch goal">
                {launchGoals.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={launchGoal === option.value}
                    onClick={() => setLaunchGoal(option.value)}
                    className={optionClasses(launchGoal === option.value)}
                  >
                    {option.label}
                    {launchGoal === option.value ? <Check size={16} aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
            ) : null}

            {step === 4 ? (
              <div>
                <p className="mb-3 text-xs text-[#aeb1b7]">Select any that matter to you.</p>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Choose launch channels">
                  {channels.map((option) => {
                    const selected = selectedChannels.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleChannel(option.value)}
                        className={optionClasses(selected)}
                      >
                        {option.label}
                        {selected ? <Check size={16} aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="mt-3 text-sm leading-5 text-[#ffaaa5]">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex min-h-10 items-center justify-between gap-3">
              {step === 0 ? (
                <Link href="/" className="inline-flex items-center gap-1 text-xs text-[#aeb1b7] transition-colors hover:text-white">
                  <ArrowLeft size={13} aria-hidden="true" />
                  Back to start
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setStep((current) => Math.max(0, current - 1));
                  }}
                  className="inline-flex items-center gap-1 text-xs text-[#aeb1b7] transition-colors hover:text-white"
                >
                  <ArrowLeft size={13} aria-hidden="true" />
                  Back
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-9 items-center gap-2 rounded-control bg-[#f1f2f3] px-3 text-sm font-medium text-[#202124] transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-[#93b5ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#202124] disabled:cursor-wait disabled:opacity-65"
              >
                {saving ? "Saving…" : step === STEP_COUNT - 1 ? "Open launch desk" : "Next"}
                {step === STEP_COUNT - 1 ? null : <ArrowRight size={15} aria-hidden="true" />}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
