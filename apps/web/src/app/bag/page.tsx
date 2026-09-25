import type { Metadata } from "next";
import { BagView } from "./bag-view";

export const metadata: Metadata = { title: "Bag" };

export default function BagPage() {
  return <BagView />;
}
