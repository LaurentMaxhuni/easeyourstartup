import Link from "next/link";
import { Logo } from "@/components/logo";

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1fr_auto] lg:px-8">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted">
            Source-backed launch campaigns made from your real product.
          </p>
        </div>
        <nav
          aria-label="Footer navigation"
          className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm"
        >
          <Link href="/">Launch studio</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/help">Help and support</Link>
          <Link href="/bot">Website scanner</Link>
          {supportEmail && <a href={`mailto:${supportEmail}`}>Contact</a>}
        </nav>
      </div>
      <div className="border-t border-line px-4 py-5 text-center font-sans text-[11px] uppercase tracking-[0.12em] text-muted">
        Built for founders who keep shipping
      </div>
    </footer>
  );
}
