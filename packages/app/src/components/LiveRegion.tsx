/** Polite screen-reader announcements for each step. Visually hidden. */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div data-testid="live-region" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
