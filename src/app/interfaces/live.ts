export interface LiveDraw {
  // draw_number identifies the provider coupon; round_number continues our season's rounds.
  draw_number: number; round_number: number; four_player_id: number;
  reg_open_time: string | null; reg_close_time: string;
  status: 'draft' | 'open' | 'locked' | 'settled'; retrieved_at: string;
  next_fetch_at: string; last_error: string | null; round_id: number | null;
}
export interface LiveEvent {
  event_number: number; match_id: string; home_team: string; away_team: string;
  player_id: number | null; kickoff: string | null; league: string | null; cancelled: boolean;
  odds: number[] | null; crowd: number[] | null;
  crowd_retrieved_at: string | null; odds_retrieved_at: string | null;
}
export interface LivePick { event_number: number; pick: string; match_id: string; revision: number; player_id: number | null; }
export interface LiveResult { event_number: number; match_id: string; outcome: string; home_score: number | null; away_score: number | null; }
export interface LivePlayer { id: number; name: string; }
