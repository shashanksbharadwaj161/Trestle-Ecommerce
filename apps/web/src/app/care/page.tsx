import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";

export const metadata: Metadata = { title: "Garment care" };

export default function CarePage() {
  return (
    <ContentPage title="Garment care" current="/care" intro="Wash less, wash cooler, dry flat. Always check the care label on the garment first.">
      <h2>Jersey tees</h2>
      <ul>
        <li>Wash at 30°C with similar colours, inside out to protect prints.</li>
        <li>Dry flat or on a hanger; tumble drying can shrink cotton jersey.</li>
        <li>Iron inside out on a low setting.</li>
      </ul>
      <h2>Dresses</h2>
      <ul>
        <li>Viscose and voile are delicate: hand wash or use a delicate cycle.</li>
        <li>Don’t wring. Roll in a towel to remove water, then line dry in the shade.</li>
        <li>Cool iron on the reverse.</li>
      </ul>
      <h2>Denim</h2>
      <ul>
        <li>Wash sparingly, inside out at 30°C. Airing between wears keeps denim fresh.</li>
        <li>New dark or black denim can transfer colour — wash it separately the first few times.</li>
        <li>Line dry to keep the shape and length.</li>
      </ul>
      <h2>Knit hats</h2>
      <ul>
        <li>Hand wash cold with a wool detergent.</li>
        <li>Press out water gently, reshape and dry flat.</li>
      </ul>
    </ContentPage>
  );
}
