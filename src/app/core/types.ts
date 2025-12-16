export type Pose = 'idle' | 'dance' | 'cheers' | 'sit';
export type Item = 'none' | 'glass' | 'balloon' | 'partyhat';

export type PlayerRow = {
  id: string;
  name: string;
  avatar_url: string | null;
  last_seen: string;
};

export type PlayerStateRow = {
  player_id: string;
  room: string;
  pose: Pose;
  item: Item;
  x: number; // 0..1
  y: number; // 0..1
  updated_at: string;
};

export type PartyPlayer = {
  id: string;
  name: string;
  avatarUrl: string | null;
  room: string;
  pose: Pose;
  item: Item;
  x: number;
  y: number;
  updatedAt: number;
};
