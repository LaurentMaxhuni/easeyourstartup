import { cn } from "@/lib/utils";

export function CampaignLoader({
  activity = "writing",
  className,
}: {
  activity?: "scanning" | "preparing" | "queued" | "writing" | "visuals";
  className?: string;
}) {
  return (
    <div className={cn("campaign-loader", className)} data-activity={activity} aria-hidden="true">
      <div className="campaign-loader__grid" />
      <div className="campaign-loader__card campaign-loader__card--back" />
      <div className="campaign-loader__card campaign-loader__card--middle" />
      <div className="campaign-loader__card campaign-loader__card--front">
        <div className="campaign-loader__heading">
          <span className="campaign-loader__brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 18 18 6M6 6h12v12" />
            </svg>
          </span>
          <span className="campaign-loader__identity"><i /><i /></span>
          <span className="campaign-loader__dot" />
        </div>
        <div className="campaign-loader__copy"><i /><i /><i /></div>
        <div className="campaign-loader__visual">
          <span className="campaign-loader__window"><i /><i /><i /><b /></span>
          <span className="campaign-loader__arrow">↗</span>
        </div>
        <div className="campaign-loader__footer"><i /><i /><i /></div>
        <div className="campaign-loader__sweep" />
      </div>
      <span className="campaign-loader__spark campaign-loader__spark--one" />
      <span className="campaign-loader__spark campaign-loader__spark--two" />
      <span className="campaign-loader__track"><i /></span>
    </div>
  );
}
