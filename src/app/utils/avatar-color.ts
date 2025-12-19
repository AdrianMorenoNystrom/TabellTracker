const AVATAR_COLORS = [
  '#FFBD00',
  '#52489C',
  '#21FA90',
  '#FF0054',
];

function hashStringToIndex(str: string, modulo: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % modulo;
}

export function avatarColorFromUserId(userId: string | null): string {
  if (!userId) return '#9ca3af';
  return AVATAR_COLORS[
    hashStringToIndex(userId, AVATAR_COLORS.length)
  ];
}
