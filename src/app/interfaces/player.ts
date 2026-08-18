export interface Player {
  id: number;
  name: string;
  score: number;
  total_matches: number;
  rounds_played?: number;
  avg_score_per_round: number; 
  matchesPicked?: number;
  season_id?: number;
  season_name?: string;
  seasonFormDifference?: number | null;
  seasonCurrentAccuracy?: number | null;
  seasonPreviousAccuracy?: number | null;
  seasonCurrentScore?: number;
  seasonCurrentPossible?: number;
  seasonPreviousScore?: number;
  seasonPreviousPossible?: number;
  currentPlacement?: number | null;
  previousPlacement?: number | null;
  placementChange?: number | null;
  bestPlacement?: number | null;
}
