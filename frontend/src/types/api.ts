export type UserRole = "USER" | "ARTIST" | "ADMIN";

export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  avatar_url: string | null;
}

export type SongStatus = "PENDING" | "APPROVED" | "REJECTED";

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

export interface NotificationItem {
  id: string;
  type: "song_approved" | "song_rejected" | "new_follower";
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
