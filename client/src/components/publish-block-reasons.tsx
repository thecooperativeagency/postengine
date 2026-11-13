export function PublishBlockReasons({
  postId,
  reasons,
}: {
  postId: number;
  reasons?: string[] | null;
}) {
  if (!reasons || reasons.length === 0) return null;
  return (
    <div
      className="rounded-md border border-amber-300/80 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
      data-testid={`publish-blocks-${postId}`}
    >
      <p className="font-medium">Blocked from publishing</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}
