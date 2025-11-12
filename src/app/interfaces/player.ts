export interface Player {
    id: number;
    name: string;
    score: number;
      total_matches: number;  
  avg_score_per_round: number; 
  matchesPicked?:number;
}
