import { avatarColor, PLAYER_COLORS_STORAGE_KEY, resetAvatarColors, setAvatarColor } from './avatar-color';

describe('Local player colours', () => {
  let previous: string | null;
  beforeEach(() => {
    previous = localStorage.getItem(PLAYER_COLORS_STORAGE_KEY);
    localStorage.removeItem(PLAYER_COLORS_STORAGE_KEY);
  });
  afterEach(() => {
    if (previous === null) localStorage.removeItem(PLAYER_COLORS_STORAGE_KEY);
    else localStorage.setItem(PLAYER_COLORS_STORAGE_KEY, previous);
  });

  it('assigns distinct defaults to all four league players', () => {
    expect(new Set(['Ompen', 'Sillen', 'Adrian', 'Danne'].map(avatarColor)).size).toBe(4);
  });

  it('persists a choice and recognises the player regardless of case or whitespace', () => {
    expect(setAvatarColor(' Adrian ', '#123abc')).toBeTrue();
    expect(JSON.parse(localStorage.getItem(PLAYER_COLORS_STORAGE_KEY)!).adrian).toBe('#123ABC');
    expect(avatarColor('ADRIAN')).toBe('#123ABC');
    localStorage.setItem(PLAYER_COLORS_STORAGE_KEY, JSON.stringify({adrian:'#456789'}));
    expect(avatarColor('Adrian')).toBe('#456789');
  });

  it('resets only the requested players', () => {
    const original = avatarColor('Adrian');
    setAvatarColor('Adrian', '#123456'); setAvatarColor('Sillen', '#654321');
    expect(resetAvatarColors(['ADRIAN'])).toBeTrue();
    expect(avatarColor('Adrian')).toBe(original);
    expect(avatarColor('Sillen')).toBe('#654321');
  });

  it('ignores malformed storage and rejects invalid colours', () => {
    const original = avatarColor('Adrian');
    localStorage.setItem(PLAYER_COLORS_STORAGE_KEY, '{broken');
    expect(avatarColor('Adrian')).toBe(original);
    localStorage.setItem(PLAYER_COLORS_STORAGE_KEY, JSON.stringify({adrian:'red; position:fixed'}));
    expect(avatarColor('Adrian')).toBe(original);
    expect(setAvatarColor('Adrian', 'invalid')).toBeFalse();
    expect(setAvatarColor('', '#123456')).toBeFalse();
  });

  it('keeps defaults usable when browser storage is unavailable and reports failed saves', () => {
    const original = avatarColor('Adrian');
    const read = spyOn(Storage.prototype,'getItem').and.throwError('Blocked');
    const write = spyOn(Storage.prototype,'setItem').and.throwError('Blocked');
    try {
      expect(avatarColor('Adrian')).toBe(original);
      expect(setAvatarColor('Adrian','#123456')).toBeFalse();
      expect(resetAvatarColors(['Adrian'])).toBeFalse();
    } finally { read.and.callThrough(); write.and.callThrough(); }
  });
});
