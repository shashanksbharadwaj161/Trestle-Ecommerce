import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="md:container-page mt-4 md:mt-14 md:grid md:grid-cols-12 md:gap-10 xl:gap-16" aria-busy="true" aria-label="Loading product">
      <div className="grid grid-cols-1 gap-[2px] md:col-span-7 md:grid-cols-2">
        <Skeleton className="aspect-[3/4]" />
        <Skeleton className="hidden aspect-[3/4] md:block" />
      </div>
      <div className="container-page space-y-4 pt-6 md:col-span-5 md:px-0 md:pt-0">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="mt-8 h-8 w-40" />
        <Skeleton className="h-11" />
        <Skeleton className="h-12" />
      </div>
    </div>
  );
}
