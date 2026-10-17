import Link from "next/link";
import { marketingHref } from "@/lib/tenancy/marketing-link";
import { supportEmail } from "@/lib/support";

export async function Footer() {
  const href = await marketingHref();
  return (
    <footer className="mt-24 border-t border-ink-muted/15 bg-white">
      <div className="mx-auto max-w-content px-6 py-12 grid gap-8 md:grid-cols-4 text-sm">
        <div>
          <div className="font-display text-lg font-semibold text-ink">Compass</div>
          <p className="mt-2 text-ink-muted">
            The planning and communication hub for Scout units.
          </p>
        </div>
        <div>
          <div className="font-medium mb-2">Product</div>
          <ul className="space-y-1.5 text-ink-muted">
            <li><Link href={href("/plans")}>Pricing</Link></li>
            <li><Link href={href("/security")}>Security</Link></li>
            <li><Link href={href("/positioning")}>Why Compass</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-medium mb-2">Company</div>
          <ul className="space-y-1.5 text-ink-muted">
            <li><Link href={href("/pitch")}>About</Link></li>
            <li><a href={`mailto:${supportEmail()}`}>Contact</a></li>
          </ul>
        </div>
        <div>
          <div className="font-medium mb-2">Legal</div>
          <ul className="space-y-1.5 text-ink-muted">
            <li>Not affiliated with Scouting America.</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
