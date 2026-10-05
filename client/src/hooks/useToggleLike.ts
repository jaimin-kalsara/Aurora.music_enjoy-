import { useCallback } from 'react';
import { useLibrary } from '../store/library';
import { useRecommendations } from '../store/recommendations';
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
      const rec = useRecommendations.getState();
      void (wasLiked ? rec.recordUnlike(song.id) : rec.recordLike(song.id));
    },
    [toggleLike],
  );
}
