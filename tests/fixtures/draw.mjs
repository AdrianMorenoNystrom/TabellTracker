export function draw(overrides = {}) {
  return {
    productId: 1, productName: 'Stryktipset', drawNumber: 4971, drawState: 'Open', rowPrice: '1,00',
    regOpenTime: '2026-09-14T07:30:00+02:00', regCloseTime: '2026-09-19T15:59:00+02:00',
    drawEvents: Array.from({ length: 13 }, (_, i) => ({
      eventNumber: i + 1, cancelled: false,
      match: { matchId: 100 + i, matchStart: '2026-09-19T16:00:00+02:00',
        participants: [{ type: 'away', name: `Away ${i}`, shortName: 'WRONG' }, { type: 'home', name: `Home ${i}` }],
        league: { name: 'League', country: { isoCode: 'ENG' } }, sportEventStatus: 'NotStarted' },
      odds: { one: '1,65', x: '4,20', two: '5,50' },
      svenskaFolket: { one: '68', x: '17', two: '15', date: '2026-09-16T18:27:46.202+02:00' },
    })), ...overrides,
  };
}
