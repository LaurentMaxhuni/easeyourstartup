export default function Loading() {
  return (
    <main id="main-content" aria-busy="true" aria-live="polite" className="min-h-[60dvh] px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <p className="sr-only">Loading page…</p>
        <div className="h-3 w-28 animate-pulse rounded bg-surface" />
        <div className="mt-5 h-10 w-64 max-w-full animate-pulse rounded bg-surface" />
        <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-surface" />
        <div className="mt-10 h-64 animate-pulse rounded-container border border-line bg-surface-raised" />
      </div>
    </main>
  );
}
