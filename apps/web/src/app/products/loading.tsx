import { Container } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container aria-busy="true" aria-label="Loading products">
      <Skeleton className="mb-6 h-9 w-56" />
      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <Skeleton className="h-96" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      </div>
    </Container>
  );
}
