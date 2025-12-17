export interface MatchRow {
  eventNumber: number;
  start: string;
  league?: string;

  home: { name: string; odds: number; pct: number };
  draw: { odds: number; pct: number };
  away: { name: string; odds: number; pct: number };
}
