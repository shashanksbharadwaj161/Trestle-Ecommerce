import { Container } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-3 h-9 w-72" />
      <Skeleton className="mb-8 h-4 w-96 max-w-full" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[3/4]" />
        ))}
      </div>
    </Container>
  );
}
