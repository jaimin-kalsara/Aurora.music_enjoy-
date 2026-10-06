import { useCallback } from 'react';
import { api } from '../api';
import { useLibrary } from '../store/library';
import { toast } from '../store/toast';
import type { Song } from '../types';

/** Like/unlike with confirmation and recommendation feedback, shared by every heart button. */
export function useToggleLike() {
  const toggleLike = useLibrary((s) => s.toggleLike);
  return useCallback(
    (song: Song) => {
      const wasLiked = Boolean(useLibrary.getState().liked[song.id]);
      toggleLike(song);
      toast(wasLiked ? 'Removed from Liked Songs' : 'Added to Liked Songs');
      // Feedback only tunes recommendations; a failed request must not undo the like.
      void (wasLiked ? api.recordUnlike(song.id) : api.recordLike(song.id)).catch(() => undefined);
    },
    [toggleLike],
  );
}
