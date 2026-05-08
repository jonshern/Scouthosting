import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { ReleasesStrip } from "@/components/site/ReleasesStrip";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <ReleasesStrip variant="footer" />
      <Footer />
    </>
  );
}
