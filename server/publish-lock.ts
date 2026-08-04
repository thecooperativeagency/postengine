const inFlightPostPublishes = new Set<number>();

export interface PublishLockResult<T> {
  acquired: boolean;
  result: T | null;
}

export async function withPublishLock<T>(postId: number, work: () => Promise<T>): Promise<PublishLockResult<T>> {
  if (inFlightPostPublishes.has(postId)) {
    return {
      acquired: false,
      result: null,
    };
  }

  inFlightPostPublishes.add(postId);

  try {
    return {
      acquired: true,
      result: await work(),
    };
  } finally {
    inFlightPostPublishes.delete(postId);
  }
}

export function resetPublishLocks() {
  inFlightPostPublishes.clear();
}
