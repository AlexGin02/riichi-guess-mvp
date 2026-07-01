export const SUIT_TILES = [
  "1m",
  "2m",
  "3m",
  "4m",
  "5m",
  "6m",
  "7m",
  "8m",
  "9m",
  "1p",
  "2p",
  "3p",
  "4p",
  "5p",
  "6p",
  "7p",
  "8p",
  "9p",
  "1s",
  "2s",
  "3s",
  "4s",
  "5s",
  "6s",
  "7s",
  "8s",
  "9s"
] as const;

export const HONOR_TILES = ["E", "S", "W", "N", "P", "F", "C"] as const;
export const TILE_TYPES = [...SUIT_TILES, ...HONOR_TILES] as const;

export type Tile = (typeof TILE_TYPES)[number];
export type Seat = "east" | "south";
export type Phase = "waiting" | "draw_discard" | "guessing" | "self_draw_trial" | "game_over";

export type InitialDeal = {
  eastHand: Tile[];
  southHand: Tile[];
  wall: Tile[];
};

export type DrawResult = {
  tile: Tile | null;
  hand: Tile[];
  wall: Tile[];
};

export type DiscardResult = {
  hand: Tile[];
  river: Tile[];
};

export type SelfDrawTrialResult = {
  won: boolean;
  hitTile: Tile | null;
  draws: Tile[];
  remainingWall: Tile[];
  attemptsUsed: number;
};

const TILE_ORDER = new Map<Tile, number>(TILE_TYPES.map((tile, index) => [tile, index]));
const TILE_SET = new Set<string>(TILE_TYPES);

export function isTile(value: string): value is Tile {
  return TILE_SET.has(value);
}

export function createWall(): Tile[] {
  return TILE_TYPES.flatMap((tile) => [tile, tile, tile, tile]);
}

export function shuffleWall(wall: Tile[], random: () => number = Math.random): Tile[] {
  const shuffled = [...wall];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function dealInitialHands(wall: Tile[]): InitialDeal {
  if (wall.length < 27) {
    throw new Error("A full deal requires at least 27 tiles.");
  }

  const eastHand = sortHand(wall.slice(0, 14));
  const southHand = sortHand(wall.slice(14, 27));
  return {
    eastHand,
    southHand,
    wall: wall.slice(27)
  };
}

export function drawTile(hand: Tile[], wall: Tile[]): DrawResult {
  const [tile, ...remainingWall] = wall;
  if (!tile) {
    return { tile: null, hand: sortHand(hand), wall: [] };
  }

  return {
    tile,
    hand: sortHand([...hand, tile]),
    wall: remainingWall
  };
}

export function discardTile(hand: Tile[], river: Tile[], tile: Tile): DiscardResult {
  const index = hand.indexOf(tile);
  if (index === -1) {
    throw new Error(`Cannot discard ${tile}; it is not in the hand.`);
  }

  const nextHand = [...hand];
  nextHand.splice(index, 1);
  return {
    hand: sortHand(nextHand),
    river: [...river, tile]
  };
}

export function sortHand(hand: Tile[]): Tile[] {
  return [...hand].sort((a, b) => tileSortValue(a) - tileSortValue(b));
}

export function isWinningHand(hand: Tile[]): boolean {
  if (hand.length % 3 !== 2) {
    return false;
  }

  const counts = toCounts(hand);
  return isSevenPairs(counts, hand.length) || canMakeFourMeldsAndPair(counts);
}

export function getWinningTilesForTenpai(hand: Tile[]): Tile[] {
  if (hand.length % 3 !== 1) {
    return [];
  }

  const currentCounts = toCounts(hand);
  return TILE_TYPES.filter((tile) => {
    const index = tileSortValue(tile);
    if (currentCounts[index] >= 4) {
      return false;
    }

    return isWinningHand(sortHand([...hand, tile]));
  });
}

export function isTenpai(hand: Tile[]): boolean {
  return getWinningTilesForTenpai(hand).length > 0;
}

export function checkGuessAgainstWaits(guessedTiles: Tile[], waits: Tile[]): boolean {
  const waitSet = new Set<Tile>(waits);
  return guessedTiles.some((tile) => waitSet.has(tile));
}

export function runSelfDrawTrial(
  lockedWaits: Tile[],
  wall: Tile[],
  maxDraws = 5
): SelfDrawTrialResult {
  const waitSet = new Set<Tile>(lockedWaits);
  const draws: Tile[] = [];
  let hitTile: Tile | null = null;
  let attemptsUsed = 0;

  for (const tile of wall.slice(0, maxDraws)) {
    attemptsUsed += 1;
    draws.push(tile);
    if (waitSet.has(tile)) {
      hitTile = tile;
      break;
    }
  }

  return {
    won: hitTile !== null,
    hitTile,
    draws,
    remainingWall: wall.slice(attemptsUsed),
    attemptsUsed
  };
}

export function tileLabel(tile: Tile): string {
  const labels: Record<Tile, string> = {
    "1m": "一萬",
    "2m": "二萬",
    "3m": "三萬",
    "4m": "四萬",
    "5m": "五萬",
    "6m": "六萬",
    "7m": "七萬",
    "8m": "八萬",
    "9m": "九萬",
    "1p": "一筒",
    "2p": "二筒",
    "3p": "三筒",
    "4p": "四筒",
    "5p": "五筒",
    "6p": "六筒",
    "7p": "七筒",
    "8p": "八筒",
    "9p": "九筒",
    "1s": "一索",
    "2s": "二索",
    "3s": "三索",
    "4s": "四索",
    "5s": "五索",
    "6s": "六索",
    "7s": "七索",
    "8s": "八索",
    "9s": "九索",
    E: "東",
    S: "南",
    W: "西",
    N: "北",
    P: "白",
    F: "發",
    C: "中"
  };
  return labels[tile];
}

function tileSortValue(tile: Tile): number {
  const value = TILE_ORDER.get(tile);
  if (value === undefined) {
    throw new Error(`Unknown tile: ${tile}`);
  }
  return value;
}

function toCounts(hand: Tile[]): number[] {
  const counts = Array(TILE_TYPES.length).fill(0);
  for (const tile of hand) {
    counts[tileSortValue(tile)] += 1;
  }
  return counts;
}

function isSevenPairs(counts: number[], handLength: number): boolean {
  return handLength === 14 && counts.filter((count) => count === 2).length === 7;
}

function canMakeFourMeldsAndPair(counts: number[]): boolean {
  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] >= 2) {
      const remaining = [...counts];
      remaining[index] -= 2;
      if (canMakeMelds(remaining)) {
        return true;
      }
    }
  }

  return false;
}

function canMakeMelds(counts: number[]): boolean {
  const firstTileIndex = counts.findIndex((count) => count > 0);
  if (firstTileIndex === -1) {
    return true;
  }

  if (counts[firstTileIndex] >= 3) {
    counts[firstTileIndex] -= 3;
    if (canMakeMelds(counts)) {
      counts[firstTileIndex] += 3;
      return true;
    }
    counts[firstTileIndex] += 3;
  }

  if (canStartSequence(firstTileIndex, counts)) {
    counts[firstTileIndex] -= 1;
    counts[firstTileIndex + 1] -= 1;
    counts[firstTileIndex + 2] -= 1;
    if (canMakeMelds(counts)) {
      counts[firstTileIndex] += 1;
      counts[firstTileIndex + 1] += 1;
      counts[firstTileIndex + 2] += 1;
      return true;
    }
    counts[firstTileIndex] += 1;
    counts[firstTileIndex + 1] += 1;
    counts[firstTileIndex + 2] += 1;
  }

  return false;
}

function canStartSequence(index: number, counts: number[]): boolean {
  const tile = TILE_TYPES[index];
  if (!tile.endsWith("m") && !tile.endsWith("p") && !tile.endsWith("s")) {
    return false;
  }

  const number = Number(tile[0]);
  if (number > 7) {
    return false;
  }

  return counts[index + 1] > 0 && counts[index + 2] > 0;
}
