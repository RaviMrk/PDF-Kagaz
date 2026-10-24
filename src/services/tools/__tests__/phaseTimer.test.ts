import { createPhaseTimer, formatPhases } from '../phaseTimer';

/** A clock that a timed function moves forward by hand. */
function fakeClock() {
  const clock = { at: 1000 };
  return { clock, now: () => clock.at };
}

const after = (clock: { at: number }, ms: number) => async () => {
  clock.at += ms;
};

describe('createPhaseTimer', () => {
  it('accumulates per phase, also when the timed work rejects', async () => {
    const { clock, now } = fakeClock();
    const timer = createPhaseTimer(now);
    await timer.time('prepare', after(clock, 30));
    await timer.time('prepare', after(clock, 20));
    await expect(
      timer.time('read', async () => {
        clock.at += 5;
        throw new Error('read failed');
      }),
    ).rejects.toThrow('read failed');
    expect(timer.totals()).toEqual({
      stage: 0,
      prepare: 50,
      read: 5,
      embed: 0,
      save: 0,
      publish: 0,
    });
  });

  it('returns what the timed work returns', async () => {
    const timer = createPhaseTimer(() => 0);
    await expect(timer.time('stage', async () => 42)).resolves.toBe(42);
  });

  it('leaves a phase timed inside another out of the outer phase', async () => {
    const { clock, now } = fakeClock();
    const timer = createPhaseTimer(now);
    await timer.time('embed', async () => {
      clock.at += 10;
      await timer.time('read', after(clock, 7));
      clock.at += 3;
      await timer.time('save', async () => {
        clock.at += 2;
        await timer.time('publish', after(clock, 4));
      });
    });
    expect(timer.totals()).toMatchObject({ embed: 13, read: 7, save: 2, publish: 4 });
  });
});

describe('formatPhases', () => {
  it('lists all six phases in order', () => {
    expect(
      formatPhases('merge', {
        stage: 1,
        prepare: 2,
        read: 3,
        embed: 4,
        save: 5,
        publish: 6,
      }),
    ).toBe('[tool-phases] merge stage=1ms prepare=2ms read=3ms embed=4ms save=5ms publish=6ms');
  });
});
