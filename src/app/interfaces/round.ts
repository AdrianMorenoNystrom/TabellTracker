import { Player } from "./player";

export interface Round {
    id: number;
    roundNumber: number;
    week:number;
    totalScore: number;
    players: Player[];
}

// DTOs for creating data
export interface PlayerScoreInput { name: string; score: number; }
export interface RoundCreate {
    roundNumber: number;
    week: number;
    players: PlayerScoreInput[];
}
