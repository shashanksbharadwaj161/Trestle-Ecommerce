import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="pt-8" aria-busy="true" aria-label="Loading">
      <div className="container-page">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-8 h-10 w-64" />
      </div>
      <div className="mt-10 grid grid-cols-2 gap-[2px] md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="aspect-[3/4]" />
            <Skeleton className="mx-0.5 mt-3 h-3.5 w-2/3" />
            <Skeleton className="mx-0.5 mt-2 h-3.5 w-1/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
