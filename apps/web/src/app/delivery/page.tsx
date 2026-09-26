import type { Metadata } from "next";
import { SHIPPING_METHODS, formatCents } from "@trestle/shared";
import { ContentPage } from "@/components/content-page";

export const metadata: Metadata = { title: "Delivery" };

export default function DeliveryPage() {
  return (
    <ContentPage
      title="Delivery"
      current="/delivery"
      intro="Delivery options and prices, as charged at checkout."
    >
      <table className="not-prose w-full border-collapse text-sm">
        <caption className="sr-only">Delivery options</caption>
        <thead>
          <tr className="border-b border-foreground text-left">
            <th scope="col" className="py-2 pr-4 font-medium">
              Option
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Estimated time
            </th>
            <th scope="col" className="py-2 font-medium">
              Price
            </th>
          </tr>
        </thead>
        <tbody>
          {Object.values(SHIPPING_METHODS).map((m) => (
            <tr key={m.id} className="border-b border-border">
              <td className="py-3 pr-4">{m.label}</td>
              <td className="py-3 pr-4 text-muted-foreground">{m.detail}</td>
              <td className="tabular py-3 text-muted-foreground">
                {formatCents(m.cents)}
                {m.freeOverCents !== null && ` · free over ${formatCents(m.freeOverCents)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Where we deliver</h2>
      <p>
        You choose your delivery country at checkout. Delivery times are estimates from dispatch.
        Prices do not include local import duties or taxes, which may be charged by the carrier on
        delivery.
      </p>
      <h2>Tracking</h2>
      <p>
        When your order ships, its carrier and tracking number appear on your order page, with a
        link to the carrier’s tracking.
      </p>
    </ContentPage>
  );
}
