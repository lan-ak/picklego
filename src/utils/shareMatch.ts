import { formatDateWithTime } from './dateFormat';

interface ShareMatchParams {
  link: string;
  scheduledDate: string | Date;
  location?: string;
  matchType: 'singles' | 'doubles';
  numberOfGames: number;
  pointsToWin: number;
  currentPlayers: number;
  maxPlayers: number;
}

export function buildMatchShareMessage(params: ShareMatchParams): string {
  const matchTypeLabel = params.matchType === 'doubles' ? 'Doubles' : 'Singles';
  const bestOf = params.numberOfGames > 1 ? `Best of ${params.numberOfGames}` : '1 game';

  return [
    'Join my pickleball match!',
    '',
    formatDateWithTime(params.scheduledDate),
    params.location || '',
    `${matchTypeLabel} · ${bestOf} · ${params.pointsToWin} pts`,
    `${params.currentPlayers}/${params.maxPlayers} players joined`,
    '',
    `Tap to join: ${params.link}`,
  ].filter(Boolean).join('\n');
}
