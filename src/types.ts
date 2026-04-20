export type TikTokVideo = {
  video_id: string;
  title: string;
  creator_username: string;
  creator_nickname: string;
  creator_id: string;
  creator_avatar: string;
  play_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  collect_count: number;
  create_time: number; // unix seconds
  create_date: string; // ISO
  cover: string;
  duration: number;
};

export type TikTokCreator = {
  username: string;
  nickname: string;
  id: string;
  avatar: string;
  video_count_in_window: number;
  total_plays_in_window: number;
  total_likes_in_window: number;
  total_comments_in_window: number;
  total_shares_in_window: number;
  follower_count: number;
  following_count: number;
  heart_count: number;
  total_videos: number;
  verified: boolean;
  videos: TikTokVideo[];
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
