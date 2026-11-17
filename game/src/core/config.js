// World layout and tuning constants for Solara Bay. Everything spatial derives from the block grid.
export const BLOCK = 64;          // a city block including its sidewalks
export const ROAD = 14;           // carriageway width (one lane each way)
export const CELL = BLOCK + ROAD; // distance between road centrelines
export const GRID_X = 8;          // blocks west→east
export const GRID_Z = 7;          // blocks north→south
export const LANE = 3.4;          // lane centre offset from the road centreline
export const SIDEWALK = 4;        // sidewalk width on each block edge
export const CURB = 0.16;         // sidewalk height

export const X0 = -(GRID_X * CELL) / 2;   // x of the westmost road centreline
export const Z0 = -(GRID_Z * CELL) / 2;   // z of the northmost road centreline
export const LAND = {
  minX: X0 - ROAD / 2 - 10,
  maxX: -X0 + ROAD / 2 + 10,
  minZ: Z0 - ROAD / 2 - 10,
  maxZ: -Z0 + ROAD / 2 + 58,       // the south side opens onto Sunset Beach
};
export const BEACH_Z = -Z0 + ROAD / 2 + 6;
export const SEA_LEVEL = -1.2;

export const roadX = (i) => X0 + i * CELL;
export const roadZ = (j) => Z0 + j * CELL;
export const blockCenterX = (bx) => X0 + bx * CELL + CELL / 2;
export const blockCenterZ = (bz) => Z0 + bz * CELL + CELL / 2;

// Districts, by block coordinates. Names are this game's own.
export function districtOf(bx, bz) {
  if (bx >= 6) return 'oldport';
  if (bz >= 5) return 'coral';
  if (bx <= 1) return 'palms';
  if (bz === 0) return 'midtown';
  return 'downtown';
}
export const DISTRICT_NAMES = {
  oldport: 'Old Port', coral: 'Coral Strip', palms: 'Palm Heights', midtown: 'Vista Midtown', downtown: 'Downtown Solara', beach: 'Sunset Beach',
};
export const PARK_BLOCKS = [[3, 2], [1, 4]];

export const PLAYER = { walk: 3.2, run: 6.6, accel: 30, radius: 0.42, maxHealth: 100, maxArmor: 100 };
export const TIME = { startHour: 16.5, secondsPerHour: 75 };
export const SAVE_KEY = 'harborheat.save.v1';
