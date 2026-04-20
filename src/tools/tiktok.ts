import "dotenv/config";
import type { TikTokAccount, TikTokPost } from "../types.js";

const API_KEY = process.env.TIKTOK_API_KEY ?? "";
const BASE_URL = process.env.TIKTOK_API_BASE_URL ?? "https://api.tiktok.com";

export const hasRealCredentials = () => API_KEY.length > 0;

export async function searchArtists(opts: {
  query: string;
  maxResults?: number;
}): Promise<TikTokAccount[]> {
  if (!hasRealCredentials()) {
    console.warn("[tiktok] No TIKTOK_API_KEY set — returning mock data.");
    return mockAccounts(opts.maxResults ?? 20);
  }
  // TODO: replace with real TikTok API call once endpoint shape is known.
  // Expected flow:
  //   1. POST ${BASE_URL}/v2/research/user/search with { query, max_count }
  //   2. For each user, fetch last N videos via /v2/research/video/list
  //   3. Map into TikTokAccount[]
  throw new Error("TikTok real API not wired yet — provide endpoint docs.");
}

export async function getAccountDetails(
  handle: string,
): Promise<TikTokAccount | null> {
  if (!hasRealCredentials()) {
    return mockAccounts(1, handle)[0] ?? null;
  }
  throw new Error("TikTok real API not wired yet — provide endpoint docs.");
}

// ---- mock data for dev ------------------------------------------------------

function mockAccounts(n: number, forceHandle?: string): TikTokAccount[] {
  const base: Omit<TikTokAccount, "handle" | "display_name">[] = [
    {
      bio: "23 | making beats in my bedroom | new single out now",
      followers: 12_400,
      following: 342,
      total_likes: 480_000,
      verified: false,
      language_hint: "en",
      recent_posts: [mockPost("midnight-drive", 2, true)],
    },
    {
      bio: "afrobeats | lagos → london | bookings: dm",
      followers: 89_000,
      following: 210,
      total_likes: 2_100_000,
      verified: false,
      language_hint: "en",
      recent_posts: [mockPost("lagos-nights", 5, true)],
    },
    {
      bio: "indie pop artist | new ep dropping soon",
      followers: 3_200,
      following: 800,
      total_likes: 110_000,
      verified: false,
      language_hint: "en",
      recent_posts: [mockPost("paper-planes", 11, true)],
    },
  ];
  return Array.from({ length: n }, (_, i) => {
    const template = base[i % base.length];
    const handle = forceHandle ?? `artist_${String(i).padStart(3, "0")}`;
    return {
      ...template,
      handle,
      display_name: handle.replace("_", " "),
    };
  });
}

function mockPost(slug: string, daysAgo: number, original: boolean): TikTokPost {
  const postedAt = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return {
    id: `${slug}-${daysAgo}`,
    url: `https://tiktok.com/@mock/video/${slug}`,
    caption: `new song "${slug.replace("-", " ")}" out now 🎧`,
    posted_at: postedAt,
    views: 48_000,
    likes: 3_900,
    comments: 210,
    shares: 84,
    is_original_sound: original,
    sound_title: slug.replace("-", " "),
  };
}
