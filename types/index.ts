export interface User {
  id: string;
  socketId: string;
  name: string;
  score: number;
  status: 'idle' | 'challenging' | 'challenged' | 'playing';
  bet?: number;
}

export interface Match {
  id: string;
  player1: { id: string; name: string };
  player2: { id: string; name: string };
  pot: number;
}

export interface GameResult {
  winnerId: string;
  newScore: number;
}

export interface ChallengeRequest {
  challengerName: string;
  bet: number;
}

export interface ServerToClientEvents {
  session_data: (user: User) => void;
  match_found: (match: Match) => void;
  waiting: (msg: string) => void;
  error: (msg: string) => void;
  game_over: (result: GameResult) => void;
  update_data: (data: { users: User[]; matches: Match[] }) => void;
  incoming_challenge: (data: ChallengeRequest) => void;
  challenge_declined: () => void;
}

export interface ClientToServerEvents {
  login: (data: { name: string; token: string }) => void;
  find_match: (betAmount: number) => void;
  finish_game: (data: { matchId: string; winnerId: string }) => void;
  answer_challenge: (accepted: boolean) => void;
  admin_login: () => void;
  
  // NOVO: Evento para atualizar pontuação manualmente
  admin_update_score: (data: { userId: string; amount: number }) => void;
}