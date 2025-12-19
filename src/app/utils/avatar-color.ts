const AVATAR_COLORS = [
  '#FFBD00',
  '#52489C',
  '#21FA90',
  '#FF0054',
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // gör till 32-bit int
  }
  return Math.abs(hash);
}

export function avatarColor(displayName: string | null): string {
  if (!displayName) return '#9CA3AF'; // fallback grå

  const hash = hashString(displayName.toLowerCase());
  const index = hash % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}