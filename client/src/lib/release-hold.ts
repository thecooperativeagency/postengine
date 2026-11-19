import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/** Release a held post back to the status it had before the hold (usually queued for review). */
export function useReleaseHold(onReleased?: () => void) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/posts/${id}/release-hold`);
      return res.json();
    },
    onSuccess: (post: { status?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Hold released", description: post?.status ? `Back to ${post.status}. Approve it from the review queue.` : undefined });
      onReleased?.();
    },
    onError: (err: Error) => {
      toast({ title: "Could not release hold", description: err.message, variant: "destructive" });
    },
  });
}
