export type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`bg-surface-container-high block rounded-lg motion-safe:animate-pulse motion-reduce:animate-none ${className}`}
    />
  );
}

export function SessionListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-1" role="status" aria-label="Loading reflections">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-xl p-3">
          <Skeleton className={`h-4 ${index % 3 === 0 ? "w-3/4" : index % 3 === 1 ? "w-full" : "w-2/3"}`} />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
      <span className="sr-only">Loading your reflections</span>
    </div>
  );
}

export function ConversationSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading reflection">
      <div className="flex justify-end">
        <Skeleton className="h-16 w-3/5 rounded-2xl" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-12 w-2/5 rounded-2xl" />
      </div>
      <span className="sr-only">Loading this reflection</span>
    </div>
  );
}
