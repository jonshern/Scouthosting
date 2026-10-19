import Link from "next/link";
import { marketingHref } from "@/lib/tenancy/marketing-link";
import { supportEmail } from "@/lib/support";
import { Wordmark } from "@/components/ui/Wordmark";

export async function Footer() {
  const href = await marketingHref();
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-content gap-8 px-6 py-12 text-sm sm:grid-cols-2 md:grid-cols-4">
        <div>
          <Wordmark size={17} />
          <p className="mt-3 text-muted">
            The planning and communication hub for Scout units.
          </p>
        </div>
        <div>
          <div className="mb-3 font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-muted">Product</div>
          <ul className="space-y-2 text-ink-2 [&_a]:text-ink-2 [&_a]:no-underline [&_a:hover]:text-ink">
            <li><Link href={href("/plans")}>Pricing</Link></li>
            <li><Link href={href("/security")}>Security</Link></li>
            <li><Link href={href("/positioning")}>Why Compass</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-3 font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-muted">Company</div>
          <ul className="space-y-2 text-ink-2 [&_a]:text-ink-2 [&_a]:no-underline [&_a:hover]:text-ink">
            <li><Link href={href("/pitch")}>About</Link></li>
            <li><Link href={href("/contact")}>Contact</Link></li>
            <li><a href={`mailto:${supportEmail()}`}>{supportEmail()}</a></li>
          </ul>
        </div>
        <div>
          <div className="mb-3 font-mono text-[12px] font-medium uppercase tracking-[0.08em] text-muted">Legal</div>
          <ul className="space-y-2 text-ink-2 [&_a]:text-ink-2 [&_a]:no-underline [&_a:hover]:text-ink">
            <li>Not affiliated with Scouting America.</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
