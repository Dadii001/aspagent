export type TikTokAccount = {
  handle: string;
  display_name: string;
  bio: string;
  followers: number;
  following: number;
  total_likes: number;
  verified: boolean;
  language_hint?: string;
  recent_posts: TikTokPost[];
};

export type TikTokPost = {
  id: string;
  url: string;
  caption: string;
  posted_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  is_original_sound: boolean;
  sound_title?: string;
};

export type Lead = {
  tiktok_handle: string;
  display_name: string;
  followers: number;
  latest_track: string | null;
  latest_track_url: string | null;
  latest_post_at: string | null;
  score: number;
  score_breakdown: string;
  genre_hint: string | null;
  needs_review: boolean;
  dm_status: "pending" | "drafted" | "sent" | "replied" | "skipped";
};
