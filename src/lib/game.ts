import {
  Tile,
  Phase,
  Seat,
  checkGuessAgainstWaits,
  createWall,
  dealInitialHands,
  discardTile,
  getWinningTilesForTenpai,
  runSelfDrawTrial,
  shuffleWall,
  sortHand
} from "./mahjong";

export type PlayerState = {
  id: string;
  seat: Seat;
  hand: Tile[];
  drawnTile?: Tile | null;
  river: Tile[];
  melds?: OpenMeld[];
  isConnected: boolean;
};

export type CallType = "chi" | "pon" | "kan";

export type OpenMeld = {
  type: CallType;
  tiles: Tile[];
  calledTile: Tile;
  fromSeat: Seat;
};

export type PendingCall = {
  discarderSeat: Seat;
  responderSeat: Seat;
  tile: Tile;
  options: CallType[];
};

export type GuessRecord = {
  guessedTiles: Tile[];
  correct: boolean;
  waits?: Tile[];
};

export type SelfDrawRecord = {
  draws: Tile[];
  hitTile: Tile | null;
  won: boolean;
};

export type GameState = {
  roomCode: string;
  phase: Phase;
  currentTurn: Seat;
  eastPlayerId: string | null;
  southPlayerId: string | null;
  players: Record<Seat, PlayerState | null>;
  pendingSouthHand: Tile[];
  wall: Tile[];
  tenpaiSeat: Seat | null;
  guesserSeat: Seat | null;
  lockedWaits: Tile[];
  pendingCall: PendingCall | null;
  guessHistory: GuessRecord[];
  selfDrawAttempts: SelfDrawRecord[];
  winnerSeat: Seat | null;
  winReason: "guesser_correct" | "self_draw" | "exhaustive_draw" | null;
};

export function createInitialGame(roomCode: string, eastPlayerId: string, random = Math.random): GameState {
  const wall = shuffleWall(createWall(), random);
  const deal = dealInitialHands(wall);
  return {
    roomCode,
    phase: "waiting",
    currentTurn: "east",
    eastPlayerId,
    southPlayerId: null,
    players: {
      east: {
        id: eastPlayerId,
        seat: "east",
        hand: deal.eastHand,
        drawnTile: null,
        river: [],
        melds: [],
        isConnected: true
      },
      south: null
    },
    pendingSouthHand: deal.southHand,
    wall: deal.wall,
    tenpaiSeat: null,
    guesserSeat: null,
    lockedWaits: [],
    pendingCall: null,
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: null,
    winReason: null
  };
}

export function joinGame(state: GameState, southPlayerId: string): GameState {
  const south = state.players.south;
  if (south && south.id !== southPlayerId) {
    throw new Error("Room already has a South player.");
  }

  return {
    ...state,
    phase: "draw_discard",
    southPlayerId,
    players: {
      ...state.players,
      south: south ?? {
        id: southPlayerId,
        seat: "south",
        hand: state.pendingSouthHand,
        drawnTile: null,
        river: [],
        melds: [],
        isConnected: true
      }
    }
  };
}

export function resetGameKeepingPlayers(state: GameState, random = Math.random): GameState {
  if (!state.eastPlayerId) {
    throw new Error("Cannot reset a room without an East player.");
  }

  const next = createInitialGame(state.roomCode, state.eastPlayerId, random);
  return state.southPlayerId ? joinGame(next, state.southPlayerId) : next;
}

export function startNextHandWithRotatedSeats(state: GameState, random = Math.random): GameState {
  if (!state.eastPlayerId || !state.southPlayerId) {
    throw new Error("Cannot start the next hand without two players.");
  }

  const next = createInitialGame(state.roomCode, state.southPlayerId, random);
  return joinGame(next, state.eastPlayerId);
}

export function forceKnownTenpaiSetup(state: GameState, seat: Seat): GameState {
  assertPhase(state, "draw_discard");
  assertTurn(state, seat);
  const player = requirePlayer(state, seat);
  const knownTenpaiHand: Tile[] = [
    "1m",
    "2m",
    "3m",
    "1p",
    "2p",
    "3p",
    "1s",
    "2s",
    "3s",
    "E",
    "E",
    "E",
    "5m",
    "9m"
  ];

  return {
    ...state,
    wall: ["1m", "2m", "3m", "4m", "6m", "5m", ...state.wall],
    players: {
      ...state.players,
      [seat]: { ...player, hand: sortHand(knownTenpaiHand), drawnTile: null }
    }
  };
}

export function setSouthInitialHand(state: GameState, southHand: Tile[]): GameState {
  const south = requirePlayer(state, "south");
  return {
    ...state,
    players: {
      ...state.players,
      south: { ...south, hand: sortHand(southHand) }
    }
  };
}

export function takeDraw(state: GameState, seat: Seat): GameState {
  assertPhase(state, "draw_discard");
  assertTurn(state, seat);
  const player = requirePlayer(state, seat);
  if (player.drawnTile) {
    return state;
  }

  if (state.wall.length === 0) {
    return endExhaustiveDraw(state);
  }

  const [tile, ...remainingWall] = state.wall;
  return {
    ...state,
    wall: remainingWall,
    players: {
      ...state.players,
      [seat]: { ...player, drawnTile: tile }
    }
  };
}

export function takeDiscard(state: GameState, seat: Seat, tile: Tile, source: "hand" | "drawn" = "hand"): GameState {
  assertPhase(state, "draw_discard");
  assertTurn(state, seat);
  if (state.pendingCall) {
    throw new Error("Call decision is pending.");
  }
  const player = requirePlayer(state, seat);
  const discarded = discardFromPlayer(player, tile, source);
  const nextSeat = seat === "east" ? "south" : "east";
  const nextState: GameState = {
    ...state,
    currentTurn: nextSeat,
    players: {
      ...state.players,
      [seat]: { ...player, hand: discarded.hand, drawnTile: discarded.drawnTile, river: discarded.river }
    }
  };

  const tenpaiState = detectTenpaiAfterDiscard(nextState);
  if (tenpaiState.phase !== "draw_discard") {
    return tenpaiState;
  }

  const callOptions = getCallOptions(tile, requirePlayer(tenpaiState, nextSeat).hand);
  if (callOptions.length > 0) {
    return {
      ...tenpaiState,
      pendingCall: {
        discarderSeat: seat,
        responderSeat: nextSeat,
        tile,
        options: callOptions
      }
    };
  }

  return drawForTurnStart(tenpaiState, nextSeat);
}

export function skipCall(state: GameState, seat: Seat): GameState {
  assertPhase(state, "draw_discard");
  const pendingCall = requirePendingCall(state, seat);
  return drawForTurnStart({ ...state, pendingCall: null }, pendingCall.responderSeat);
}

export function takeCall(state: GameState, seat: Seat, type: CallType): GameState {
  assertPhase(state, "draw_discard");
  const pendingCall = requirePendingCall(state, seat);
  if (!pendingCall.options.includes(type)) {
    throw new Error(`${type} is not available.`);
  }

  const caller = requirePlayer(state, seat);
  const discarder = requirePlayer(state, pendingCall.discarderSeat);
  const consumedTiles = getConsumedTilesForCall(type, pendingCall.tile, caller.hand);
  const nextCallerHand = removeTiles(caller.hand, consumedTiles);
  const nextDiscarderRiver = [...discarder.river];
  const calledTileIndex = nextDiscarderRiver.lastIndexOf(pendingCall.tile);
  if (calledTileIndex !== -1) {
    nextDiscarderRiver.splice(calledTileIndex, 1);
  }

  let nextState: GameState = {
    ...state,
    currentTurn: seat,
    pendingCall: null,
    players: {
      ...state.players,
      [pendingCall.discarderSeat]: { ...discarder, river: nextDiscarderRiver },
      [seat]: {
        ...caller,
        hand: sortHand(nextCallerHand),
        melds: [
          ...(caller.melds ?? []),
          {
            type,
            tiles: sortHand([...consumedTiles, pendingCall.tile]),
            calledTile: pendingCall.tile,
            fromSeat: pendingCall.discarderSeat
          }
        ]
      }
    }
  };

  if (type === "kan") {
    nextState = drawForTurnStart(nextState, seat);
  }

  return nextState;
}

export function resolveGuess(state: GameState, guessedTiles: Tile[]): GameState {
  assertPhase(state, "guessing");
  if (guessedTiles.length !== 2 || new Set(guessedTiles).size !== 2) {
    throw new Error("A guess must contain exactly two distinct tile types.");
  }
  const previouslyGuessed = getPreviouslyGuessedTiles(state);
  if (guessedTiles.some((tile) => previouslyGuessed.has(tile))) {
    throw new Error("不能重复猜已经猜过的牌。");
  }

  const correct = checkGuessAgainstWaits(guessedTiles, state.lockedWaits);
  const nextGuess = { guessedTiles, correct, waits: correct ? state.lockedWaits : undefined };
  const guessHistory = state.guessHistory ?? [];
  if (correct) {
    return {
      ...state,
      phase: "game_over",
      winnerSeat: state.guesserSeat,
      winReason: "guesser_correct",
      guessHistory: [...guessHistory, nextGuess]
    };
  }

  return {
    ...state,
    phase: "self_draw_trial",
    guessHistory: [...guessHistory, nextGuess]
  };
}

export function resolveSelfDrawTrial(state: GameState, maxDraws = 5): GameState {
  assertPhase(state, "self_draw_trial");
  const result = runSelfDrawTrial(state.lockedWaits, state.wall, maxDraws);
  const selfDrawAttempts = state.selfDrawAttempts ?? [];
  const selfDrawRecord = {
    draws: result.draws,
    hitTile: result.hitTile,
    won: result.won
  };

  if (result.won) {
    return {
      ...state,
      phase: "game_over",
      wall: result.remainingWall,
      winnerSeat: state.tenpaiSeat,
      winReason: "self_draw",
      selfDrawAttempts: [...selfDrawAttempts, selfDrawRecord]
    };
  }

  if (result.remainingWall.length === 0) {
    return {
      ...state,
      phase: "game_over",
      wall: result.remainingWall,
      winnerSeat: null,
      winReason: "exhaustive_draw",
      selfDrawAttempts: [...selfDrawAttempts, selfDrawRecord]
    };
  }

  return {
    ...state,
    phase: "guessing",
    wall: result.remainingWall,
    selfDrawAttempts: [...selfDrawAttempts, selfDrawRecord]
  };
}

export function getPreviouslyGuessedTiles(state: Pick<GameState, "guessHistory">): Set<Tile> {
  return new Set((state.guessHistory ?? []).flatMap((guess) => guess.guessedTiles));
}

export function publicStateForSeat(state: GameState, viewerSeat: Seat | null): GameState {
  const hideHand = (player: PlayerState | null, seat: Seat) => {
    if (!player || seat === viewerSeat || state.phase === "game_over") {
      return player;
    }
    return { ...player, hand: [] };
  };

  return {
    ...state,
    lockedWaits: state.phase === "game_over" ? state.lockedWaits : [],
    players: {
      east: hideHand(state.players.east, "east"),
      south: hideHand(state.players.south, "south")
    }
  };
}

function detectTenpaiAfterDiscard(state: GameState): GameState {
  const east = requirePlayer(state, "east");
  const south = requirePlayer(state, "south");
  const eastWaits = getWinningTilesForTenpai(east.hand);
  const southWaits = getWinningTilesForTenpai(south.hand);

  if (eastWaits.length > 0) {
    return lockTenpai(state, "east", eastWaits);
  }
  if (southWaits.length > 0) {
    return lockTenpai(state, "south", southWaits);
  }
  return state;
}

function lockTenpai(state: GameState, tenpaiSeat: Seat, waits: Tile[]): GameState {
  return {
    ...state,
    phase: "guessing",
    pendingCall: null,
    tenpaiSeat,
    guesserSeat: tenpaiSeat === "east" ? "south" : "east",
    lockedWaits: waits
  };
}

function getCallOptions(tile: Tile, hand: Tile[]): CallType[] {
  const options: CallType[] = [];
  if (getChiCombos(tile, hand).length > 0) {
    options.push("chi");
  }
  if (countTile(hand, tile) >= 2) {
    options.push("pon");
  }
  if (countTile(hand, tile) >= 3) {
    options.push("kan");
  }
  return options;
}

function getConsumedTilesForCall(type: CallType, tile: Tile, hand: Tile[]): Tile[] {
  if (type === "pon") {
    return [tile, tile];
  }
  if (type === "kan") {
    return [tile, tile, tile];
  }

  const combo = getChiCombos(tile, hand)[0];
  if (!combo) {
    throw new Error("No chi combination is available.");
  }
  return combo;
}

function getChiCombos(tile: Tile, hand: Tile[]): Tile[][] {
  const parsed = parseSuitTile(tile);
  if (!parsed) {
    return [];
  }

  const candidates = [
    [parsed.number - 2, parsed.number - 1],
    [parsed.number - 1, parsed.number + 1],
    [parsed.number + 1, parsed.number + 2]
  ];

  return candidates
    .filter(([first, second]) => first >= 1 && second <= 9)
    .map(([first, second]) => [`${first}${parsed.suit}` as Tile, `${second}${parsed.suit}` as Tile])
    .filter(([firstTile, secondTile]) => hand.includes(firstTile) && hand.includes(secondTile));
}

function parseSuitTile(tile: Tile): { number: number; suit: "m" | "p" | "s" } | null {
  if (!tile.endsWith("m") && !tile.endsWith("p") && !tile.endsWith("s")) {
    return null;
  }
  return {
    number: Number(tile[0]),
    suit: tile[1] as "m" | "p" | "s"
  };
}

function countTile(hand: Tile[], tile: Tile): number {
  return hand.filter((handTile) => handTile === tile).length;
}

function removeTiles(hand: Tile[], tilesToRemove: Tile[]): Tile[] {
  const nextHand = [...hand];
  for (const tile of tilesToRemove) {
    const index = nextHand.indexOf(tile);
    if (index === -1) {
      throw new Error(`Cannot call with missing tile ${tile}.`);
    }
    nextHand.splice(index, 1);
  }
  return nextHand;
}

function requirePendingCall(state: GameState, seat: Seat): PendingCall {
  const pendingCall = state.pendingCall;
  if (!pendingCall) {
    throw new Error("No call decision is pending.");
  }
  if (pendingCall.responderSeat !== seat) {
    throw new Error("Only the responder can make this call decision.");
  }
  return pendingCall;
}

function drawForTurnStart(state: GameState, seat: Seat): GameState {
  if (state.wall.length === 0) {
    return endExhaustiveDraw(state);
  }

  const player = requirePlayer(state, seat);
  if (player.drawnTile) {
    return state;
  }

  const [tile, ...remainingWall] = state.wall;
  return {
    ...state,
    wall: remainingWall,
    players: {
      ...state.players,
      [seat]: { ...player, drawnTile: tile }
    }
  };
}

function discardFromPlayer(player: PlayerState, tile: Tile, source: "hand" | "drawn"): { hand: Tile[]; drawnTile: Tile | null; river: Tile[] } {
  if (source === "drawn") {
    if (player.drawnTile !== tile) {
      throw new Error(`Cannot discard ${tile}; it is not the drawn tile.`);
    }
    return {
      hand: sortHand(player.hand),
      drawnTile: null,
      river: [...player.river, tile]
    };
  }

  const discarded = discardTile(player.hand, player.river, tile);
  return {
    hand: sortHand(player.drawnTile ? [...discarded.hand, player.drawnTile] : discarded.hand),
    drawnTile: null,
    river: discarded.river
  };
}

function endExhaustiveDraw(state: GameState): GameState {
  return {
    ...state,
    phase: "game_over",
    winnerSeat: null,
    winReason: "exhaustive_draw"
  };
}

function requirePlayer(state: GameState, seat: Seat): PlayerState {
  const player = state.players[seat];
  if (!player) {
    throw new Error(`${seat} player is not seated.`);
  }
  return player;
}

function assertPhase(state: GameState, phase: Phase): void {
  if (state.phase !== phase) {
    throw new Error(`Expected phase ${phase}, got ${state.phase}.`);
  }
}

function assertTurn(state: GameState, seat: Seat): void {
  if (state.currentTurn !== seat) {
    throw new Error(`It is ${state.currentTurn}'s turn.`);
  }
}
