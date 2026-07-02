import {
  Tile,
  Phase,
  Seat,
  checkGuessAgainstWaits,
  createWall,
  dealInitialHands,
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
  river: RiverTile[];
  melds?: OpenMeld[];
  isConnected: boolean;
};

export type CallType = "chi" | "pon" | "kan";
export type DiscardSource = "tsumogiri" | "tedashi";
export type RiverEntry = { tile: Tile; source: DiscardSource };
export type RiverTile = Tile | RiverEntry;

export type OpenMeld = {
  type: CallType;
  tiles: Tile[];
  calledTileIndex: number;
  calledTile: Tile;
  fromSeat: Seat;
  concealed?: boolean;
  kanSubtype?: "open" | "added" | "concealed";
};

export type MeldTileView = {
  tile: Tile | null;
  hidden: boolean;
  sideways: boolean;
};

export type PendingCall = {
  discarderSeat: Seat;
  responderSeat: Seat;
  tile: Tile;
  options: CallType[];
  pendingChiOptions?: ChiOption[];
};

export type ChiOption = {
  tiles: Tile[];
  consumedTiles: Tile[];
  calledTileIndex: number;
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

export type GuessCandidateViewState = {
  hinted: boolean;
  disabled: boolean;
  crossed: boolean;
};

export type GameState = {
  roomCode: string;
  handNumber?: number;
  phase: Phase;
  currentTurn: Seat;
  eastPlayerId: string | null;
  southPlayerId: string | null;
  players: Record<Seat, PlayerState | null>;
  pendingSouthHand: Tile[];
  wall: Tile[];
  deadWall?: Tile[];
  doraIndicators?: Tile[];
  uraDoraIndicators?: Tile[];
  rinshanTiles?: Tile[];
  revealedDoraCount?: number;
  pendingDoraRevealAfterDiscardSeat?: Seat | null;
  tenpaiSeat: Seat | null;
  guesserSeat: Seat | null;
  lockedWaits: Tile[];
  pendingCall: PendingCall | null;
  callPromptSettings?: Record<string, boolean>;
  guessHistory: GuessRecord[];
  selfDrawAttempts: SelfDrawRecord[];
  rematchReadyPlayerIds?: string[];
  winnerSeat: Seat | null;
  winReason: "guesser_correct" | "self_draw" | "exhaustive_draw" | null;
};

export function createInitialGame(roomCode: string, eastPlayerId: string, random = Math.random, handNumber = 1): GameState {
  const wall = shuffleWall(createWall(), random);
  const { liveWall, deadWall } = reserveDeadWall(wall);
  const deal = dealInitialHands(liveWall);
  return {
    roomCode,
    handNumber,
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
    deadWall,
    doraIndicators: deadWall.slice(0, 5),
    uraDoraIndicators: deadWall.slice(5, 10),
    rinshanTiles: deadWall.slice(10, 14),
    revealedDoraCount: 1,
    pendingDoraRevealAfterDiscardSeat: null,
    tenpaiSeat: null,
    guesserSeat: null,
    lockedWaits: [],
    pendingCall: null,
    callPromptSettings: { [eastPlayerId]: true },
    guessHistory: [],
    selfDrawAttempts: [],
    rematchReadyPlayerIds: [],
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
    callPromptSettings: {
      ...(state.callPromptSettings ?? {}),
      [southPlayerId]: true
    },
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

  const next = createInitialGame(state.roomCode, state.southPlayerId, random, (state.handNumber ?? 1) + 1);
  return joinGame(next, state.eastPlayerId);
}

export function requestNextHand(state: GameState, playerId: string, random = Math.random): GameState {
  assertPhase(state, "game_over");
  if (!state.eastPlayerId || !state.southPlayerId) {
    throw new Error("Cannot start the next hand without two players.");
  }
  if (playerId !== state.eastPlayerId && playerId !== state.southPlayerId) {
    throw new Error("Only seated players can request the next hand.");
  }

  const readyPlayerIds = Array.from(new Set([...(state.rematchReadyPlayerIds ?? []), playerId]));
  if (readyPlayerIds.includes(state.eastPlayerId) && readyPlayerIds.includes(state.southPlayerId)) {
    return startNextHandWithRotatedSeats(state, random);
  }

  return {
    ...state,
    rematchReadyPlayerIds: readyPlayerIds
  };
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

export function getConcealedKanOptions(state: GameState, seat: Seat): Tile[] {
  if (state.phase !== "draw_discard" || state.currentTurn !== seat || state.pendingCall) {
    return [];
  }

  const player = requirePlayer(state, seat);
  const counts = new Map<Tile, number>();
  for (const tile of [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])]) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }

  return [...counts.entries()].filter(([, count]) => count >= 4).map(([tile]) => tile);
}

export function takeConcealedKan(state: GameState, seat: Seat, tile: Tile): GameState {
  assertPhase(state, "draw_discard");
  assertTurn(state, seat);
  if (state.pendingCall) {
    throw new Error("Call decision is pending.");
  }
  if (!getConcealedKanOptions(state, seat).includes(tile)) {
    throw new Error("No concealed kan is available for this tile.");
  }

  const player = requirePlayer(state, seat);
  const removed = removeTilesFromPlayerConcealedKan(player, tile);
  const meld: OpenMeld = {
    type: "kan",
    tiles: [tile, tile, tile, tile],
    calledTileIndex: 1,
    calledTile: tile,
    fromSeat: seat,
    concealed: true,
    kanSubtype: "concealed"
  };

  return drawRinshanForKan(revealNextDoraIndicator({
    ...state,
    pendingDoraRevealAfterDiscardSeat: null,
    players: {
      ...state.players,
      [seat]: {
        ...player,
        hand: sortHand(removed.hand),
        drawnTile: removed.drawnTile,
        melds: [...(player.melds ?? []), meld]
      }
    }
  }), seat);
}

export function getAddedKanOptions(state: GameState, seat: Seat): Tile[] {
  if (state.phase !== "draw_discard" || state.currentTurn !== seat || state.pendingCall) {
    return [];
  }

  const player = requirePlayer(state, seat);
  const handTiles = [...player.hand, ...(player.drawnTile ? [player.drawnTile] : [])];
  return (player.melds ?? [])
    .filter((meld) => meld.type === "pon" && meld.tiles.length === 3 && meld.tiles.every((tile) => tile === meld.tiles[0]))
    .map((meld) => meld.tiles[0])
    .filter((tile, index, tiles) => handTiles.includes(tile) && tiles.indexOf(tile) === index);
}

export function takeAddedKan(state: GameState, seat: Seat, tile: Tile): GameState {
  assertPhase(state, "draw_discard");
  assertTurn(state, seat);
  if (state.pendingCall) {
    throw new Error("Call decision is pending.");
  }
  if (!getAddedKanOptions(state, seat).includes(tile)) {
    throw new Error("No added kan is available for this tile.");
  }

  const player = requirePlayer(state, seat);
  const meldIndex = (player.melds ?? []).findIndex((meld) => meld.type === "pon" && meld.tiles.length === 3 && meld.tiles.every((meldTile) => meldTile === tile));
  if (meldIndex === -1) {
    throw new Error("No pon meld is available to upgrade.");
  }

  const removed = removeOneTileFromPlayer(player, tile);
  const nextMelds = [...(player.melds ?? [])];
  const ponMeld = nextMelds[meldIndex];
  nextMelds[meldIndex] = {
    ...ponMeld,
    type: "kan",
    tiles: [tile, tile, tile, tile],
    calledTileIndex: Number.isInteger(ponMeld.calledTileIndex) ? ponMeld.calledTileIndex : 1,
    calledTile: tile,
    concealed: false,
    kanSubtype: "added"
  };

  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [seat]: {
        ...player,
        hand: sortHand(removed.hand),
        drawnTile: removed.drawnTile,
        melds: nextMelds
      }
    }
  };

  return {
    ...drawRinshanForKan(nextState, seat),
    pendingDoraRevealAfterDiscardSeat: seat
  };
}

export function takeDiscard(state: GameState, seat: Seat, tile: Tile, source: "hand" | "drawn" = "hand"): GameState {
  assertPhase(state, "draw_discard");
  assertTurn(state, seat);
  if (state.pendingCall) {
    throw new Error("Call decision is pending.");
  }
  const player = requirePlayer(state, seat);
  const discarded = discardFromPlayer(player, seat, tile, source);
  const nextSeat = seat === "east" ? "south" : "east";
  const nextState: GameState = {
    ...state,
    currentTurn: nextSeat,
    pendingDoraRevealAfterDiscardSeat: state.pendingDoraRevealAfterDiscardSeat === seat ? null : state.pendingDoraRevealAfterDiscardSeat,
    players: {
      ...state.players,
      [seat]: { ...player, hand: discarded.hand, drawnTile: discarded.drawnTile, river: discarded.river }
    }
  };
  const afterPendingDoraReveal = state.pendingDoraRevealAfterDiscardSeat === seat ? revealNextDoraIndicator(nextState) : nextState;

  const tenpaiState = detectTenpaiAfterDiscard(afterPendingDoraReveal);
  if (tenpaiState.phase !== "draw_discard") {
    return tenpaiState;
  }

  const callOptions = getCallOptions(tile, requirePlayer(tenpaiState, nextSeat).hand);
  const responder = requirePlayer(tenpaiState, nextSeat);
  if (callOptions.length > 0 && isCallPromptEnabled(tenpaiState, responder.id)) {
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

export function isCallPromptEnabled(state: Pick<GameState, "callPromptSettings">, playerId: string): boolean {
  return state.callPromptSettings?.[playerId] ?? true;
}

export function setCallPromptEnabled(state: GameState, playerId: string, enabled: boolean): GameState {
  if (playerId !== state.eastPlayerId && playerId !== state.southPlayerId) {
    throw new Error("Only seated players can update call prompt preference.");
  }

  return {
    ...state,
    callPromptSettings: {
      ...(state.callPromptSettings ?? {}),
      [playerId]: enabled
    }
  };
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
  if (type === "chi") {
    const chiOptions = getChiOptions(pendingCall.tile, caller.hand);
    if (chiOptions.length > 1 && !pendingCall.pendingChiOptions) {
      return {
        ...state,
        pendingCall: {
          ...pendingCall,
          pendingChiOptions: chiOptions
        }
      };
    }
  }

  const consumedTiles = getConsumedTilesForCall(type, pendingCall.tile, caller.hand);
  return completeCall(state, seat, type, consumedTiles);
}

export function takeChiOption(state: GameState, seat: Seat, optionIndex: number): GameState {
  assertPhase(state, "draw_discard");
  const pendingCall = requirePendingCall(state, seat);
  if (!pendingCall.options.includes("chi")) {
    throw new Error("chi is not available.");
  }
  const chiOption = pendingCall.pendingChiOptions?.[optionIndex];
  if (!chiOption) {
    throw new Error("Chi option is not available.");
  }

  return completeCall(state, seat, "chi", chiOption.consumedTiles);
}

function completeCall(state: GameState, seat: Seat, type: CallType, consumedTiles: Tile[]): GameState {
  const pendingCall = requirePendingCall(state, seat);
  const caller = requirePlayer(state, seat);
  const discarder = requirePlayer(state, pendingCall.discarderSeat);
  const openMeld = createOpenMeld(type, consumedTiles, pendingCall.tile, pendingCall.discarderSeat);
  const nextCallerHand = removeTiles(caller.hand, consumedTiles);
  const nextDiscarderRiver = [...discarder.river];
  const calledTileIndex = findLastRiverTileIndex(nextDiscarderRiver, pendingCall.tile);
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
          openMeld
        ]
      }
    }
  };

  if (type === "kan") {
    nextState = {
      ...drawRinshanForKan(nextState, seat),
      pendingDoraRevealAfterDiscardSeat: seat
    };
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

export function getPublicHintedGuessTiles(state: Pick<GameState, "players" | "tenpaiSeat" | "selfDrawAttempts">): Set<Tile> {
  const tenpaiRiverTiles = state.tenpaiSeat ? state.players[state.tenpaiSeat]?.river.map(riverTileValue) ?? [] : [];
  const failedSelfDrawTiles = (state.selfDrawAttempts ?? []).filter((attempt) => !attempt.won).flatMap((attempt) => attempt.draws);
  return new Set([...tenpaiRiverTiles, ...failedSelfDrawTiles]);
}

export function getGuessCandidateViewState(state: Pick<GameState, "guessHistory" | "players" | "tenpaiSeat" | "selfDrawAttempts">, tile: Tile): GuessCandidateViewState {
  const wasGuessed = getPreviouslyGuessedTiles(state).has(tile);
  return {
    hinted: !wasGuessed && getPublicHintedGuessTiles(state).has(tile),
    disabled: wasGuessed,
    crossed: wasGuessed
  };
}

export function getVisibleDoraIndicators(state: Pick<GameState, "doraIndicators" | "revealedDoraCount">): Tile[] {
  return (state.doraIndicators ?? []).slice(0, Math.max(1, Math.min(5, state.revealedDoraCount ?? 1)));
}

export function getHiddenDoraIndicatorCount(state: Pick<GameState, "doraIndicators" | "revealedDoraCount">): number {
  return Math.max(0, 5 - getVisibleDoraIndicators(state).length);
}

export function shouldAutoSkipCallPrompt(state: Pick<GameState, "pendingCall">, seat: Seat | null, callPromptsEnabled: boolean): boolean {
  return Boolean(!callPromptsEnabled && seat && state.pendingCall?.responderSeat === seat);
}

export function getMeldTileViews(meld: OpenMeld): MeldTileView[] {
  if (meld.type === "kan" && meld.concealed) {
    return meld.tiles.map((tile, index) => ({
      tile: index === 0 || index === meld.tiles.length - 1 ? null : tile,
      hidden: index === 0 || index === meld.tiles.length - 1,
      sideways: false
    }));
  }

  const calledTileIndex = Number.isInteger(meld.calledTileIndex) ? meld.calledTileIndex : meld.type === "pon" || meld.type === "kan" ? 1 : Math.max(0, meld.tiles.indexOf(meld.calledTile));
  return meld.tiles.map((tile, index) => ({
    tile,
    hidden: false,
    sideways: index === calledTileIndex
  }));
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

  const combo = getChiOptions(tile, hand)[0]?.consumedTiles;
  if (!combo) {
    throw new Error("No chi combination is available.");
  }
  return combo;
}

function createOpenMeld(type: CallType, consumedTiles: Tile[], calledTile: Tile, fromSeat: Seat): OpenMeld {
  const tiles = type === "chi" ? createChiMeldTiles(consumedTiles, calledTile) : sortHand([...consumedTiles, calledTile]);
  return {
    type,
    tiles,
    calledTileIndex: type === "chi" ? tiles.indexOf(calledTile) : 1,
    calledTile,
    fromSeat,
    kanSubtype: type === "kan" ? "open" : undefined
  };
}

function reserveDeadWall(wall: Tile[]): { liveWall: Tile[]; deadWall: Tile[] } {
  if (wall.length < 14) {
    return { liveWall: wall, deadWall: [] };
  }
  return {
    liveWall: wall.slice(0, -14),
    deadWall: wall.slice(-14)
  };
}

function revealNextDoraIndicator(state: GameState): GameState {
  return {
    ...state,
    revealedDoraCount: Math.min(5, (state.revealedDoraCount ?? 1) + 1)
  };
}

function drawRinshanForKan(state: GameState, seat: Seat): GameState {
  if (!state.rinshanTiles) {
    return drawForTurnStart(state, seat);
  }
  if (state.rinshanTiles.length === 0) {
    return endExhaustiveDraw(state);
  }

  const player = requirePlayer(state, seat);
  const [tile, ...remainingRinshanTiles] = state.rinshanTiles;
  return {
    ...state,
    rinshanTiles: remainingRinshanTiles,
    players: {
      ...state.players,
      [seat]: {
        ...player,
        hand: sortHand(player.drawnTile ? [...player.hand, player.drawnTile] : player.hand),
        drawnTile: tile
      }
    }
  };
}

function removeTilesFromPlayerConcealedKan(player: PlayerState, tile: Tile): { hand: Tile[]; drawnTile: Tile | null } {
  let remainingToRemove = 4;
  const nextHand = [...player.hand];
  for (let index = nextHand.length - 1; index >= 0 && remainingToRemove > 0; index -= 1) {
    if (nextHand[index] === tile) {
      nextHand.splice(index, 1);
      remainingToRemove -= 1;
    }
  }

  let drawnTile = player.drawnTile ?? null;
  if (remainingToRemove > 0 && drawnTile === tile) {
    drawnTile = null;
    remainingToRemove -= 1;
  }

  if (remainingToRemove !== 0) {
    throw new Error("Concealed kan requires four matching tiles.");
  }

  return { hand: nextHand, drawnTile };
}

function removeOneTileFromPlayer(player: PlayerState, tile: Tile): { hand: Tile[]; drawnTile: Tile | null } {
  const handIndex = player.hand.indexOf(tile);
  if (handIndex !== -1) {
    const hand = [...player.hand];
    hand.splice(handIndex, 1);
    return { hand, drawnTile: player.drawnTile ?? null };
  }

  if (player.drawnTile === tile) {
    return { hand: player.hand, drawnTile: null };
  }

  throw new Error(`Cannot remove ${tile}; it is not in the hand.`);
}

export function getChiOptions(tile: Tile, hand: Tile[]): ChiOption[] {
  return getChiCombos(tile, hand).map((consumedTiles) => {
    const tiles = createChiMeldTiles(consumedTiles, tile);
    return {
      tiles,
      consumedTiles,
      calledTileIndex: tiles.indexOf(tile)
    };
  });
}

function createChiMeldTiles(consumedTiles: Tile[], calledTile: Tile): Tile[] {
  return sortHand([...consumedTiles, calledTile]);
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

export function riverTileValue(entry: RiverTile): Tile {
  return typeof entry === "string" ? entry : entry.tile;
}

export function riverTileSource(entry: RiverTile): DiscardSource {
  return typeof entry === "string" ? "tsumogiri" : entry.source;
}

function discardFromPlayer(player: PlayerState, seat: Seat, tile: Tile, source: "hand" | "drawn"): { hand: Tile[]; drawnTile: Tile | null; river: RiverTile[] } {
  const riverEntry = createRiverEntry(player, seat, tile, source);
  if (source === "drawn") {
    if (player.drawnTile !== tile) {
      throw new Error(`Cannot discard ${tile}; it is not the drawn tile.`);
    }
    return {
      hand: sortHand(player.hand),
      drawnTile: null,
      river: [...player.river, riverEntry]
    };
  }

  const nextHand = removeTileFromHand(player.hand, tile);
  return {
    hand: sortHand(player.drawnTile ? [...nextHand, player.drawnTile] : nextHand),
    drawnTile: null,
    river: [...player.river, riverEntry]
  };
}

function createRiverEntry(player: PlayerState, seat: Seat, tile: Tile, source: "hand" | "drawn"): RiverEntry {
  const isEastFirstDiscard = seat === "east" && player.river.length === 0;
  return {
    tile,
    source: source === "drawn" || isEastFirstDiscard ? "tsumogiri" : "tedashi"
  };
}

function removeTileFromHand(hand: Tile[], tile: Tile): Tile[] {
  const index = hand.indexOf(tile);
  if (index === -1) {
    throw new Error(`Cannot discard ${tile}; it is not in the hand.`);
  }

  const nextHand = [...hand];
  nextHand.splice(index, 1);
  return nextHand;
}

function findLastRiverTileIndex(river: RiverTile[], tile: Tile): number {
  for (let index = river.length - 1; index >= 0; index -= 1) {
    if (riverTileValue(river[index]) === tile) {
      return index;
    }
  }
  return -1;
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
