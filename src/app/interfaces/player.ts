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
  predictedNextScore?: number | null;
  predictedNextPossible?: number | null;
  projectedFinalScore?: number | null;
  projectedSeasonRounds?: number | null;
  predictionAccuracy?: number | null;
}
