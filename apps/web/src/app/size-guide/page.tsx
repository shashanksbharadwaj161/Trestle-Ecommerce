import type { Metadata } from "next";
import { SIZE_CHARTS } from "@trestle/shared";
import { ContentPage } from "@/components/content-page";
import { SizeChartTable } from "@/components/size-guide";

export const metadata: Metadata = { title: "Size guide" };

export default function SizeGuidePage() {
  return (
    <ContentPage
      title="Size guide"
      current="/size-guide"
      intro="Body measurements for each size. Compare with your own measurements; each product page also notes its fit."
    >
      <div className="not-prose space-y-14">
        {Object.values(SIZE_CHARTS).map((c) => (
          <section key={c.key} aria-labelledby={`chart-${c.key}`}>
            <h2 id={`chart-${c.key}`} className="mb-4 text-lg">
              {c.title}
            </h2>
            <SizeChartTable chart={c} />
          </section>
        ))}
      </div>
    </ContentPage>
  );
}
