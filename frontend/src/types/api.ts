export type UserRole = "USER" | "ARTIST" | "ADMIN";

export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  avatar_url: string | null;
}

export type SongStatus = "PENDING" | "APPROVED" | "REJECTED";

export type LicenseStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "SUSPENDED" | "REMOVED";

export type LicenseType = "royalty_free" | "artist_owned" | "cc_by" | "other";

export interface Song {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  duration_sec: number;
  play_count: number;
  download_count: number;
  like_count: number;
  download_allowed: boolean;
  license_type: LicenseType | null;
  license_status: LicenseStatus | null;
  rights_note: string | null;
  status: SongStatus;
  cover_url: string | null;
  audio_url: string | null;
  artist_id: string;
  artist_name: string | null;
  artist_slug: string | null;
  genre: string | null;
  created_at: string;
  rejection_reason?: string | null;
}

export type MyProfile = User;

export interface PlaylistSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_public: boolean;
  song_count: number;
  cover_url: string | null;
  created_at: string;
}

export interface PlaylistDetail extends Omit<PlaylistSummary, "cover_url"> {
  owner: string;
  cover_url: string | null;
  songs: Song[];
}

export interface AnalyticsSeriesPoint {
  date: string;
  plays: number;
  likes: number;
  downloads: number;
}

export interface ArtistAnalytics {
  song_count: number;
  totals: { plays: number; downloads: number; likes: number };
  last_7_days: { plays: number; downloads: number };
  last_30_days: { plays: number; downloads: number };
  window: number;
  series: AnalyticsSeriesPoint[];
  top_songs: { id: string; title: string; plays: number; downloads: number; likes: number }[];
}

export interface JobInfo {
  id: string;
  type: "probe_upload" | "license_sweep";
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  payload: Record<string, unknown>;
  attempts: number;
  last_error: string | null;
  run_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface SongAnalytics {
  song: { id: string; title: string };
  window: number;
  totals: { plays: number; downloads: number; likes: number };
  series: AnalyticsSeriesPoint[];
}

export interface LicenseInfo {
  id: string;
  song_id: string;
  song_title: string | null;
  artist_name: string | null;
  status: LicenseStatus;
  license_type: LicenseType | null;
  rights_holder: string | null;
  proof_reference: string | null;
  effective_from: string | null;
  effective_until: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  action_reason: string | null;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  type:
    | "song_approved"
    | "song_rejected"
    | "new_follower"
    | "license_approved"
    | "license_rejected"
    | "license_suspended";
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface ArtistPublic {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  avatar_url: string | null;
  songs?: Song[];
  follower_count?: number;
  is_following?: boolean;
}

export interface SearchResults {
  query: string;
  songs: Song[];
  artists: ArtistPublic[];
}
