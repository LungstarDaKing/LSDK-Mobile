import { botInput, buildTrack, CARS, CAR_IDS, newCar, stepCar, wrapAngle } from '../src/features/games/race/engine';
import { TRACKS } from '../src/features/games/race/tracks';

function drive(trackId: string, carId: string, laps: number, maxSeconds = 600) {
  const track = buildTrack(TRACKS.find((t) => t.id === trackId)!);
  const car = newCar(track, 0, carId);
  const dt = 1 / 120; let t = 0;
  while (t < maxSeconds && car.total < laps * track.N) { stepCar(car, botInput(car, track, 0.96), track, dt, []); t += dt; }
  return { t, car, track, done: car.total >= laps * track.N };
}

describe('race engine', () => {
  it('builds every circuit with a length near the real lap', () => {
    for (const def of TRACKS) {
      const tr = buildTrack(def);
      expect(tr.N).toBeGreaterThan(300);
      expect(Math.abs(tr.length - def.km * 1700) / (def.km * 1700)).toBeLessThan(0.05);
    }
  });
  it('every circuit can be driven for a full lap by the test driver', () => {
    for (const def of TRACKS) {
      const r = drive(def.id, 'coupe', 1);
      expect({ id: def.id, done: r.done }).toEqual({ id: def.id, done: true });
      expect(r.t).toBeGreaterThan(20);
    }
  });
  it('every car can finish a lap of Kyalami', () => {
    for (const id of CAR_IDS) expect({ id, done: drive('kyalami', id, 1).done }).toEqual({ id, done: true });
  });
  it('is deterministic', () => {
    const a = drive('monaco', 'hatch', 1), b = drive('monaco', 'hatch', 1);
    expect(a.t).toBe(b.t);
  });
  it('a faster car laps quicker than a slower one', () => {
    expect(drive('kyalami', 'formula', 1).t).toBeLessThan(drive('kyalami', 'classic', 1).t);
  });
  it('counts laps forwards only and a stopped car does not move', () => {
    const track = buildTrack(TRACKS[0]);
    const car = newCar(track, 0);
    for (let i = 0; i < 240; i++) stepCar(car, { gas: 0, brake: 0, steer: 0 }, track, 1 / 120, []);
    expect(Math.hypot(car.vx, car.vy)).toBe(0);
    expect(car.total).toBeLessThan(0); // behind the line on the grid
  });
  it('keeps a car inside the barrier', () => {
    const track = buildTrack(TRACKS[0]);
    const car = newCar(track, 0);
    for (let i = 0; i < 1500; i++) stepCar(car, { gas: 1, brake: 0, steer: 1 }, track, 1 / 120, []);
    expect(Math.abs(car.lat)).toBeLessThan(track.wall + 30);
  });
  it('wraps angles', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 5);
    expect(Math.abs(wrapAngle(-Math.PI * 2.5))).toBeCloseTo(Math.PI / 2, 5);
  });
  it('has sane car stats', () => { for (const c of Object.values(CARS)) { expect(c.top).toBeGreaterThan(200); expect(c.grip).toBeGreaterThan(3); } });
});
