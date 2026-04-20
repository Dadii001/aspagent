import "dotenv/config";
import type { TikTokCreator, TikTokVideo } from "../types.js";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? "";
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST ?? "tiktok-scraper7.p.rapidapi.com";
const REQUEST_DELAY_MS = Number(process.env.TIKTOK_REQUEST_DELAY_MS ?? 200);

export const hasRealCredentials = () => RAPIDAPI_KEY.length > 0;

async function apiGet<T>(path: string): Promise<T> {
  if (!hasRealCredentials()) {
    throw new Error("RAPIDAPI_KEY not set in .env");
  }
  const url = `https://${RAPIDAPI_HOST}${path}`;
  const res = await fetch(url, {
    headers: {
      "x-rapidapi-key": RAPIDAPI_KEY,
      "x-rapidapi-host": RAPIDAPI_HOST,
    },
  });
  if (!res.ok) {
    throw new Error(`TikTok API ${path} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- raw endpoints ----------------------------------------------------------

type ChallengeSearchResponse = {
  code: number;
  data?: {
    challenge_list?: Array<{ cha_name: string; id: string; desc?: string; user_count?: number; view_count?: number }>;
  };
};

type ChallengePostsResponse = {
  code: number;
  data?: {
    videos?: Array<{
      aweme_id: string;
      title?: string;
      create_time: number;
      play_count?: number;
      digg_count?: number;
      comment_count?: number;
      share_count?: number;
      collect_count?: number;
      cover?: string;
      origin_cover?: string;
      duration?: number;
      author: { id: string; unique_id: string; nickname: string; avatar: string };
    }>;
    cursor?: number;
    hasMore?: boolean;
  };
};

type UserInfoResponse = {
  code: number;
  data?: {
    user?: { verified?: boolean; followerCount?: number; followingCount?: number; heartCount?: number; videoCount?: number };
    stats?: { followerCount?: number; followingCount?: number; heartCount?: number; videoCount?: number };
  };
};

export async function findChallengeId(hashtag: string): Promise<string | null> {
  const clean = hashtag.replace(/^#/, "").trim();
  const q = encodeURIComponent(clean);
  const res = await apiGet<ChallengeSearchResponse>(`/challenge/search?keywords=${q}&count=10&cursor=0`);
  const list = res.data?.challenge_list ?? [];
  const exact = list.find((c) => c.cha_name.toLowerCase() === clean.toLowerCase());
  return exact?.id ?? list[0]?.id ?? null;
}

export async function listChallengePosts(
  challengeId: string,
  cursor: number,
): Promise<{ videos: any[]; cursor: number; hasMore: boolean }> {
  const res = await apiGet<ChallengePostsResponse>(
    `/challenge/posts?challenge_id=${challengeId}&count=35&cursor=${cursor}`,
  );
  return {
    videos: res.data?.videos ?? [],
    cursor: res.data?.cursor ?? cursor,
    hasMore: res.data?.hasMore ?? false,
  };
}

export async function getUserInfo(username: string): Promise<{
  follower_count: number;
  following_count: number;
  heart_count: number;
  video_count: number;
  verified: boolean;
} | null> {
  try {
    const res = await apiGet<UserInfoResponse>(`/user/info?unique_id=${encodeURIComponent(username)}`);
    const stats = res.data?.stats ?? res.data?.user;
    if (!stats) return null;
    return {
      follower_count: stats.followerCount ?? 0,
      following_count: stats.followingCount ?? 0,
      heart_count: stats.heartCount ?? 0,
      video_count: stats.videoCount ?? 0,
      verified: res.data?.user?.verified ?? false,
    };
  } catch (err) {
    console.warn(`[tiktok] getUserInfo ${username} failed:`, (err as Error).message);
    return null;
  }
}

// ---- high-level pipeline ----------------------------------------------------

export async function gatherCreatorsFromHashtag(opts: {
  hashtag: string;
  hoursAgo: number;
  maxPages: number;
  onProgress?: (msg: string) => void;
}): Promise<TikTokCreator[]> {
  const { hashtag, hoursAgo, maxPages, onProgress } = opts;
  const log = onProgress ?? (() => {});

  const challengeId = await findChallengeId(hashtag);
  if (!challengeId) {
    log(`hashtag "${hashtag}" not found`);
    return [];
  }
  log(`hashtag "${hashtag}" → challenge ${challengeId}`);

  const cutoff = Math.floor(Date.now() / 1000) - hoursAgo * 3600;
  const creators = new Map<string, TikTokCreator>();
  let cursor = 0;
  let page = 0;
  let consecutiveStale = 0;
  const MAX_STALE = 5;

  while (page < maxPages && consecutiveStale < MAX_STALE) {
    const { videos, cursor: nextCursor, hasMore } = await listChallengePosts(challengeId, cursor);
    page++;
    log(`page ${page}: ${videos.length} videos`);

    let foundFresh = false;
    for (const v of videos) {
      if (v.create_time < cutoff) continue;
      foundFresh = true;
      const video: TikTokVideo = {
        video_id: v.aweme_id,
        title: v.title ?? "",
        creator_username: v.author.unique_id,
        creator_nickname: v.author.nickname,
        creator_id: v.author.id,
        creator_avatar: v.author.avatar,
        play_count: v.play_count ?? 0,
        like_count: v.digg_count ?? 0,
        comment_count: v.comment_count ?? 0,
        share_count: v.share_count ?? 0,
        collect_count: v.collect_count ?? 0,
        create_time: v.create_time,
        create_date: new Date(v.create_time * 1000).toISOString(),
        cover: v.cover ?? v.origin_cover ?? "",
        duration: v.duration ?? 0,
      };
      const existing = creators.get(video.creator_username);
      if (existing) {
        existing.video_count_in_window++;
        existing.total_plays_in_window += video.play_count;
        existing.total_likes_in_window += video.like_count;
        existing.total_comments_in_window += video.comment_count;
        existing.total_shares_in_window += video.share_count;
        existing.videos.push(video);
      } else {
        creators.set(video.creator_username, {
          username: video.creator_username,
          nickname: video.creator_nickname,
          id: video.creator_id,
          avatar: video.creator_avatar,
          video_count_in_window: 1,
          total_plays_in_window: video.play_count,
          total_likes_in_window: video.like_count,
          total_comments_in_window: video.comment_count,
          total_shares_in_window: video.share_count,
          follower_count: 0,
          following_count: 0,
          heart_count: 0,
          total_videos: 0,
          verified: false,
          videos: [video],
        });
      }
    }

    consecutiveStale = foundFresh ? 0 : consecutiveStale + 1;
    if (!hasMore) break;
    cursor = nextCursor;
    await sleep(REQUEST_DELAY_MS);
  }

  log(`hydrating follower counts for ${creators.size} creators`);
  let i = 0;
  for (const c of creators.values()) {
    i++;
    const info = await getUserInfo(c.username);
    if (info) {
      c.follower_count = info.follower_count;
      c.following_count = info.following_count;
      c.heart_count = info.heart_count;
      c.total_videos = info.video_count;
      c.verified = info.verified;
    }
    if (i % 10 === 0) log(`  ${i}/${creators.size}`);
    await sleep(REQUEST_DELAY_MS);
  }

  return Array.from(creators.values()).sort((a, b) => b.follower_count - a.follower_count);
}
