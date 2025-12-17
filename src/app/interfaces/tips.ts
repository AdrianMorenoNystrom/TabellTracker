export interface Match {
  matchNo: number;
  home: string;
  away: string;
}

export type Pick = '1' | 'X' | '2' | '1X' | '12' | 'X2';

export interface MyPick {
  matchNo: number;
  pick: Pick;
}

export interface TipStatus {
  name: string;
  submitted: boolean;
}
