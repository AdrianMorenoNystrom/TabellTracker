const AVATAR_COLORS = [
  '#2563EB',
  '#D97706',
  '#15803D',
  '#C02673',
];

// Explicit defaults avoid hash collisions between the four league members.
const PLAYER_DEFAULTS = new Map([
  ['ompen', AVATAR_COLORS[0]], ['sillen', AVATAR_COLORS[1]],
  ['adrian', AVATAR_COLORS[2]], ['danne', AVATAR_COLORS[3]],
]);
export const PLAYER_COLORS_STORAGE_KEY = 'stryktipstabellen-player-colors-v1';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const playerKey = (name: string) => name.trim().toLowerCase();
let cachedRaw: string | null | undefined;
let cachedColors: Record<string, string> = {};

function savedColors(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(PLAYER_COLORS_STORAGE_KEY);
    if (raw !== cachedRaw) {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      cachedColors = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? Object.fromEntries(Object.entries(parsed).filter(([name, color]) =>
          !!name.trim() && typeof color === 'string' && HEX_COLOR.test(color))) : {};
      cachedRaw = raw;
    }
    return cachedColors;
  } catch { return {}; }
}

function storeColors(colors: Record<string, string>): boolean {
  try {
    window.localStorage.setItem(PLAYER_COLORS_STORAGE_KEY, JSON.stringify(colors));
    return true;
  } catch { return false; }
}

export function setAvatarColor(name: string, color: string): boolean {
  if (!name.trim() || !HEX_COLOR.test(color)) return false;
  return storeColors({ ...savedColors(), [playerKey(name)]: color.toUpperCase() });
}

export function resetAvatarColors(names: string[]): boolean {
  const colors = { ...savedColors() };
  for (const name of names) delete colors[playerKey(name)];
  return storeColors(colors);
}

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

  const key = playerKey(displayName);
  const saved = savedColors();
  if (Object.hasOwn(saved, key)) return saved[key];
  const defaultColor = PLAYER_DEFAULTS.get(key);
  if (defaultColor) return defaultColor;
  const hash = hashString(key);
  const index = hash % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}
