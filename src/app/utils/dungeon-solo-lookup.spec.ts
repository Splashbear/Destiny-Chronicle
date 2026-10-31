import { findDungeonSoloFirstForLabel } from './dungeon-solo-lookup';
import { DungeonSoloFirst } from '../models/dungeon-solo-first.model';

describe('dungeon-solo-lookup', () => {
  it('matches Normal/Standard swap and earliest family solo', () => {
    const list = [
      {
        family: 'Ghosts of the Deep',
        fullName: 'Ghosts of the Deep: Normal',
        firstSolo: { period: '2023-06-02T00:00:00Z' },
      },
      {
        family: 'Ghosts of the Deep',
        fullName: 'Ghosts of the Deep: Master',
        firstSolo: { period: '2023-06-01T00:00:00Z' },
      },
    ] as DungeonSoloFirst[];

    expect(findDungeonSoloFirstForLabel(list, 'Ghosts of the Deep: Standard')?.fullName).toBe(
      'Ghosts of the Deep: Normal'
    );
    // Bare family name maps to ": Normal" via manifest→custom table before family scan.
    expect(findDungeonSoloFirstForLabel(list, 'Ghosts of the Deep')?.fullName).toBe(
      'Ghosts of the Deep: Normal'
    );
    expect(findDungeonSoloFirstForLabel(list, 'Ghosts of the Deep: Master')?.fullName).toBe(
      'Ghosts of the Deep: Master'
    );
  });
});

