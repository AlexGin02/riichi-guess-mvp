import test from "node:test";
import assert from "node:assert/strict";
import {
  checkGuessAgainstWaits,
  createWall,
  dealInitialHands,
  getWinningTilesForTenpai,
  isTenpai,
  isWinningHand,
  runSelfDrawTrial,
  shuffleWall
} from "../src/lib/mahjong.ts";
import {
  createInitialGame,
  forceKnownTenpaiSetup,
  getAddedKanOptions,
  getChiOptions,
  getConcealedKanOptions,
  getGuessCandidateViewState,
  getHiddenDoraIndicatorCount,
  getMeldTileViews,
  getPublicHintedGuessTiles,
  getPreviouslyGuessedTiles,
  getVisibleDoraIndicators,
  isCallPromptEnabled,
  joinGame,
  resetGameKeepingPlayers,
  requestNextHand,
  resolveGuess,
  resolveSelfDrawTrial,
  setCallPromptEnabled,
  startNextHandWithRotatedSeats,
  takeAddedKan,
  takeCall,
  takeChiOption,
  takeConcealedKan,
  takeDraw,
  takeDiscard
} from "../src/lib/game.ts";

test("createWall creates four copies of every tile type", () => {
  const wall = createWall();
  assert.equal(wall.length, 136);
  assert.equal(wall.filter((tile) => tile === "5m").length, 4);
  assert.equal(wall.filter((tile) => tile === "C").length, 4);
});

test("dealInitialHands gives East 14 tiles and South 13 tiles", () => {
  const deal = dealInitialHands(shuffleWall(createWall(), () => 0.42));
  assert.equal(deal.eastHand.length, 14);
  assert.equal(deal.southHand.length, 13);
  assert.equal(deal.wall.length, 109);
});

test("new hand reserves a 14-tile dead wall and starts with one visible dora indicator", () => {
  const state = createInitialGame("DORA1", "east-player", () => 0.42);
  assert.equal(state.deadWall.length, 14);
  assert.equal(state.doraIndicators.length, 5);
  assert.equal(state.uraDoraIndicators.length, 5);
  assert.equal(state.rinshanTiles.length, 4);
  assert.equal(state.wall.length, 95);
  assert.equal(getVisibleDoraIndicators(state).length, 1);
  assert.equal(getHiddenDoraIndicatorCount(state), 4);
});

test("call prompt preference defaults to on and can be turned off per player", () => {
  const state = joinGame(createInitialGame("CALLPROMPT1", "east-player", () => 0.42), "south-player");
  assert.equal(isCallPromptEnabled(state, "east-player"), true);
  assert.equal(isCallPromptEnabled(state, "south-player"), true);

  const next = setCallPromptEnabled(state, "south-player", false);
  assert.equal(isCallPromptEnabled(next, "east-player"), true);
  assert.equal(isCallPromptEnabled(next, "south-player"), false);
});

test("isWinningHand accepts standard four melds and a pair", () => {
  assert.equal(
    isWinningHand(["1m", "2m", "3m", "1p", "2p", "3p", "1s", "2s", "3s", "E", "E", "E", "5m", "5m"]),
    true
  );
});

test("isWinningHand accepts seven pairs", () => {
  assert.equal(
    isWinningHand(["1m", "1m", "2m", "2m", "3m", "3m", "4p", "4p", "5p", "5p", "6s", "6s", "E", "E"]),
    true
  );
});

test("getWinningTilesForTenpai finds a tanki pair wait", () => {
  const hand = ["1m", "2m", "3m", "1p", "2p", "3p", "1s", "2s", "3s", "E", "E", "E", "5m"];
  assert.deepEqual(getWinningTilesForTenpai(hand), ["5m"]);
  assert.equal(isTenpai(hand), true);
});

test("getWinningTilesForTenpai finds a two-sided ryanmen wait", () => {
  const hand = ["1p", "2p", "3p", "1s", "2s", "3s", "E", "E", "E", "5m", "6m", "9p", "9p"];
  assert.deepEqual(getWinningTilesForTenpai(hand), ["4m", "7m"]);
});

test("getWinningTilesForTenpai finds seven pairs tenpai", () => {
  const hand = ["1m", "1m", "2m", "2m", "3m", "3m", "4p", "4p", "5p", "5p", "6s", "6s", "E"];
  assert.deepEqual(getWinningTilesForTenpai(hand), ["E"]);
});

test("checkGuessAgainstWaits succeeds when either guessed tile is correct", () => {
  assert.equal(checkGuessAgainstWaits(["1m", "7m"], ["4m", "7m"]), true);
});

test("checkGuessAgainstWaits fails when both guessed tiles are wrong", () => {
  assert.equal(checkGuessAgainstWaits(["1m", "2m"], ["4m", "7m"]), false);
});

test("runSelfDrawTrial wins when a locked wait is drawn within five draws", () => {
  const result = runSelfDrawTrial(["5m"], ["1m", "2m", "5m", "3m"]);
  assert.equal(result.won, true);
  assert.equal(result.hitTile, "5m");
  assert.deepEqual(result.draws, ["1m", "2m", "5m"]);
  assert.deepEqual(result.remainingWall, ["3m"]);
});

test("runSelfDrawTrial returns to guessing after five misses", () => {
  const result = runSelfDrawTrial(["5m"], ["1m", "2m", "3m", "4m", "6m", "5m"]);
  assert.equal(result.won, false);
  assert.deepEqual(result.draws, ["1m", "2m", "3m", "4m", "6m"]);
  assert.deepEqual(result.remainingWall, ["5m"]);
});

test("runSelfDrawTrial uses locked waits and does not recalculate hand shape", () => {
  const result = runSelfDrawTrial(["5m"], ["4m"], 1);
  assert.equal(result.won, false);
  assert.equal(result.hitTile, null);
});

test("resetGameKeepingPlayers preserves both seats and starts East turn", () => {
  const state = joinGame(resetGameKeepingPlayers({
    roomCode: "TEST1",
    phase: "game_over",
    currentTurn: "south",
    eastPlayerId: "east-player",
    southPlayerId: null,
    players: { east: null, south: null },
    pendingSouthHand: [],
    wall: [],
    tenpaiSeat: null,
    guesserSeat: null,
    lockedWaits: [],
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: null,
    winReason: null
  }), "south-player");

  const reset = resetGameKeepingPlayers(state);
  assert.equal(reset.phase, "draw_discard");
  assert.equal(reset.currentTurn, "east");
  assert.equal(reset.players.east?.hand.length, 14);
  assert.equal(reset.players.south?.hand.length, 13);
});

test("forceKnownTenpaiSetup lets current player discard into fixed 5m wait", () => {
  const state = joinGame(resetGameKeepingPlayers({
    roomCode: "TEST2",
    phase: "game_over",
    currentTurn: "south",
    eastPlayerId: "east-player",
    southPlayerId: null,
    players: { east: null, south: null },
    pendingSouthHand: [],
    wall: [],
    tenpaiSeat: null,
    guesserSeat: null,
    lockedWaits: [],
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: null,
    winReason: null
  }), "south-player");

  const forced = forceKnownTenpaiSetup(state, "east");
  const detected = takeDiscard(forced, "east", "9m");
  assert.equal(detected.phase, "guessing");
  assert.equal(detected.tenpaiSeat, "east");
  assert.deepEqual(detected.lockedWaits, ["5m"]);
});

test("discard advances turn and automatically draws for the next player", () => {
  const state = {
    roomCode: "TURN1",
    phase: "draw_discard",
    currentTurn: "east",
    eastPlayerId: "east-player",
    southPlayerId: "south-player",
    players: {
      east: {
        id: "east-player",
        seat: "east",
        hand: ["1m", "1m", "1m", "2m", "2m", "2m", "3m", "3m", "4p", "5p", "7s", "8s", "E", "C"],
        river: [],
        isConnected: true
      },
      south: {
        id: "south-player",
        seat: "south",
        hand: ["1p", "1p", "1p", "2p", "2p", "2p", "3p", "3p", "7m", "8m", "1s", "9s", "N"],
        river: [],
        isConnected: true
      }
    },
    pendingSouthHand: [],
    wall: ["9m", "8p"],
    tenpaiSeat: null,
    guesserSeat: null,
    lockedWaits: [],
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: null,
    winReason: null
  };

  const next = takeDiscard(state, "east", "C");
  assert.equal(next.phase, "draw_discard");
  assert.equal(next.currentTurn, "south");
  assert.deepEqual(next.players.east.river, [{ tile: "C", source: "tsumogiri" }]);
  assert.equal(next.players.east.hand.length, 13);
  assert.equal(next.players.south.hand.length, 13);
  assert.equal(next.players.south.drawnTile, "9m");
  assert.deepEqual(next.wall, ["8p"]);
});

test("call prompt off skips call choices before any public pending call is created", () => {
  const state = callPromptDiscardState(false);
  const next = takeDiscard(state, "east", "5s");
  assert.equal(next.pendingCall, null);
  assert.equal(next.currentTurn, "south");
  assert.equal(next.players.south.drawnTile, "9m");
  assert.deepEqual(next.wall, ["8p"]);
});

test("call prompt on still creates normal chi pon kan prompt state", () => {
  const state = callPromptDiscardState(true);
  const next = takeDiscard(state, "east", "5s");
  assert.equal(next.pendingCall.responderSeat, "south");
  assert.deepEqual(next.pendingCall.options, ["chi"]);
  assert.equal(next.players.south.drawnTile, undefined);
});

test("wall remaining count decreases after normal automatic draw", () => {
  const state = {
    roomCode: "WALL1",
    phase: "draw_discard",
    currentTurn: "east",
    eastPlayerId: "east-player",
    southPlayerId: "south-player",
    players: {
      east: {
        id: "east-player",
        seat: "east",
        hand: ["1m", "1m", "1m", "2m", "2m", "2m", "3m", "3m", "4p", "5p", "7s", "8s", "E", "C"],
        river: [],
        isConnected: true
      },
      south: {
        id: "south-player",
        seat: "south",
        hand: ["1p", "1p", "1p", "2p", "2p", "2p", "3p", "3p", "7m", "8m", "1s", "9s", "N"],
        river: [],
        isConnected: true
      }
    },
    pendingSouthHand: [],
    wall: ["9m", "8p", "7p"],
    tenpaiSeat: null,
    guesserSeat: null,
    lockedWaits: [],
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: null,
    winReason: null
  };

  const next = takeDiscard(state, "east", "C");
  assert.equal(state.wall.length, 3);
  assert.equal(next.wall.length, 2);
});

test("drawn tile can be discarded directly as tsumogiri", () => {
  const state = {
    roomCode: "DRAW1",
    phase: "draw_discard",
    currentTurn: "south",
    eastPlayerId: "east-player",
    southPlayerId: "south-player",
    players: {
      east: { id: "east-player", seat: "east", hand: [], river: [], isConnected: true },
      south: {
        id: "south-player",
        seat: "south",
        hand: ["1p", "1p", "1p", "2p", "2p", "2p", "3p", "3p", "7m", "8m", "1s", "9s", "N"],
        drawnTile: "9m",
        river: [],
        isConnected: true
      }
    },
    pendingSouthHand: [],
    wall: ["8p"],
    tenpaiSeat: null,
    guesserSeat: null,
    lockedWaits: [],
    pendingCall: null,
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: null,
    winReason: null
  };

  const next = takeDiscard(state, "south", "9m", "drawn");
  assert.deepEqual(next.players.south.river, [{ tile: "9m", source: "tsumogiri" }]);
  assert.equal(next.players.south.hand.length, 13);
  assert.equal(next.players.south.drawnTile, null);
});

test("concealed kan option is detected but does not block normal discard", () => {
  const state = {
    roomCode: "ANKAN1",
    phase: "draw_discard",
    currentTurn: "east",
    eastPlayerId: "east-player",
    southPlayerId: "south-player",
    players: {
      east: {
        id: "east-player",
        seat: "east",
        hand: ["1m", "1m", "1m", "1m", "2p", "3p", "4p", "5s", "6s", "7s", "E", "E", "F", "C"],
        river: [],
        melds: [],
        isConnected: true
      },
      south: { id: "south-player", seat: "south", hand: [], river: [], melds: [], isConnected: true }
    },
    pendingSouthHand: [],
    wall: ["9m"],
    tenpaiSeat: null,
    guesserSeat: null,
    lockedWaits: [],
    pendingCall: null,
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: null,
    winReason: null
  };

  assert.deepEqual(getConcealedKanOptions(state, "east"), ["1m"]);
  const discarded = takeDiscard(state, "east", "C");
  assert.equal(discarded.players.east.melds.length, 0);
  assert.deepEqual(discarded.players.east.river, [{ tile: "C", source: "tsumogiri" }]);
});

test("concealed kan removes four tiles, creates a kan meld, and reveals one dora indicator", () => {
  const state = {
    roomCode: "ANKAN2",
    phase: "draw_discard",
    currentTurn: "east",
    eastPlayerId: "east-player",
    southPlayerId: "south-player",
    players: {
      east: {
        id: "east-player",
        seat: "east",
        hand: ["1m", "1m", "1m", "1m", "2p", "3p", "4p", "5s", "6s", "7s", "E", "E", "F", "C"],
        river: [],
        melds: [],
        isConnected: true
      },
      south: { id: "south-player", seat: "south", hand: [], river: [], melds: [], isConnected: true }
    },
    pendingSouthHand: [],
    wall: ["9m"],
    deadWall: ["1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "1s", "2s", "3s", "4s", "5s"],
    doraIndicators: ["1p", "2p", "3p", "4p", "5p"],
    uraDoraIndicators: ["6p", "7p", "8p", "9p", "1s"],
    rinshanTiles: ["2s", "3s", "4s", "5s"],
    revealedDoraCount: 1,
    tenpaiSeat: null,
    guesserSeat: null,
    lockedWaits: [],
    pendingCall: null,
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: null,
    winReason: null
  };

  const next = takeConcealedKan(state, "east", "1m");
  const meld = next.players.east.melds.at(-1);
  assert.equal(next.players.east.hand.filter((tile) => tile === "1m").length, 0);
  assert.deepEqual(meld.tiles, ["1m", "1m", "1m", "1m"]);
  assert.equal(meld.type, "kan");
  assert.equal(meld.concealed, true);
  assert.equal(next.revealedDoraCount, 2);
  assert.equal(next.pendingDoraRevealAfterDiscardSeat, null);
  assert.equal(next.players.east.drawnTile, "2s");
  assert.deepEqual(next.rinshanTiles, ["3s", "4s", "5s"]);
});

test("concealed kan display hides both ends and keeps all tiles upright", () => {
  const meld = {
    type: "kan",
    tiles: ["1m", "1m", "1m", "1m"],
    calledTileIndex: 1,
    calledTile: "1m",
    fromSeat: "east",
    concealed: true
  };

  assert.deepEqual(getMeldTileViews(meld), [
    { tile: null, hidden: true, sideways: false },
    { tile: "1m", hidden: false, sideways: false },
    { tile: "1m", hidden: false, sideways: false },
    { tile: null, hidden: true, sideways: false }
  ]);
});

test("added kan option is available from an existing pon and remains optional", () => {
  const state = addedKanState();
  assert.deepEqual(getAddedKanOptions(state, "east"), ["5p"]);

  const discarded = takeDiscard(state, "east", "C");
  assert.equal(discarded.players.east.melds[0].type, "pon");
  assert.equal(discarded.players.east.hand.includes("5p"), true);
  assert.deepEqual(discarded.players.east.river, [{ tile: "C", source: "tsumogiri" }]);
});

test("added kan upgrades the pon meld, removes the fourth tile, and delays dora reveal", () => {
  const state = addedKanState();
  const next = takeAddedKan(state, "east", "5p");
  const meld = next.players.east.melds[0];

  assert.equal(next.players.east.hand.includes("5p"), false);
  assert.equal(meld.type, "kan");
  assert.equal(meld.kanSubtype, "added");
  assert.equal(meld.concealed, false);
  assert.deepEqual(meld.tiles, ["5p", "5p", "5p", "5p"]);
  assert.deepEqual(getMeldTileViews(meld).map((view) => view.hidden), [false, false, false, false]);
  assert.deepEqual(getMeldTileViews(meld).map((view) => view.sideways), [false, true, false, false]);
  assert.equal(next.revealedDoraCount, 1);
  assert.equal(next.pendingDoraRevealAfterDiscardSeat, "east");
  assert.equal(next.players.east.drawnTile, "2s");
});

test("added kan reveals dora after discard and does not reveal twice", () => {
  const afterKan = takeAddedKan(addedKanState(), "east", "5p");
  const afterDiscard = takeDiscard(afterKan, "east", "2s", "drawn");
  assert.equal(afterDiscard.revealedDoraCount, 2);
  assert.equal(afterDiscard.pendingDoraRevealAfterDiscardSeat, null);

  const afterNormalDiscard = takeDiscard(afterDiscard, "south", "9m", "drawn");
  assert.equal(afterNormalDiscard.revealedDoraCount, 2);
});

test("multiple added kan options can choose which pon to upgrade", () => {
  const state = addedKanState({
    hand: ["5p", "7s", "1m", "2m", "3m", "4m", "6m", "8m", "9m", "E", "S", "W", "C"],
    melds: [
      { type: "pon", tiles: ["5p", "5p", "5p"], calledTileIndex: 1, calledTile: "5p", fromSeat: "south" },
      { type: "pon", tiles: ["7s", "7s", "7s"], calledTileIndex: 1, calledTile: "7s", fromSeat: "south" }
    ]
  });

  assert.deepEqual(getAddedKanOptions(state, "east"), ["5p", "7s"]);
  const next = takeAddedKan(state, "east", "7s");
  assert.equal(next.players.east.melds[0].type, "pon");
  assert.equal(next.players.east.melds[1].type, "kan");
  assert.equal(next.players.east.hand.includes("5p"), true);
  assert.equal(next.players.east.hand.includes("7s"), false);
});

test("discarding from main hand merges drawn tile afterward", () => {
  const state = {
    roomCode: "DRAW2",
    phase: "draw_discard",
    currentTurn: "south",
    eastPlayerId: "east-player",
    southPlayerId: "south-player",
    players: {
      east: { id: "east-player", seat: "east", hand: [], river: [], isConnected: true },
      south: {
        id: "south-player",
        seat: "south",
        hand: ["1p", "1p", "1p", "2p", "2p", "2p", "3p", "3p", "7m", "8m", "1s", "9s", "N"],
        drawnTile: "9m",
        river: [],
        isConnected: true
      }
    },
    pendingSouthHand: [],
    wall: ["8p"],
    tenpaiSeat: null,
    guesserSeat: null,
    lockedWaits: [],
    pendingCall: null,
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: null,
    winReason: null
  };

  const next = takeDiscard(state, "south", "N", "hand");
  assert.deepEqual(next.players.south.river, [{ tile: "N", source: "tedashi" }]);
  assert.equal(next.players.south.hand.includes("9m"), true);
  assert.equal(next.players.south.hand.length, 13);
  assert.equal(next.players.south.drawnTile, null);
});

test("drawing does not duplicate when a separated drawn tile already exists", () => {
  const state = {
    roomCode: "DRAW3",
    phase: "draw_discard",
    currentTurn: "south",
    eastPlayerId: "east-player",
    southPlayerId: "south-player",
    players: {
      east: { id: "east-player", seat: "east", hand: [], river: [], isConnected: true },
      south: {
        id: "south-player",
        seat: "south",
        hand: ["1p", "1p", "1p", "2p", "2p", "2p", "3p", "3p", "7m", "8m", "1s", "9s", "N"],
        drawnTile: "9m",
        river: [],
        isConnected: true
      }
    },
    pendingSouthHand: [],
    wall: ["8p"],
    tenpaiSeat: null,
    guesserSeat: null,
    lockedWaits: [],
    pendingCall: null,
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: null,
    winReason: null
  };

  const next = takeDraw(state, "south");
  assert.equal(next.players.south.drawnTile, "9m");
  assert.deepEqual(next.wall, ["8p"]);
});


test("next hand rotates East and South while preserving player identities", () => {
  const state = {
    roomCode: "NEXT1",
    phase: "game_over",
    currentTurn: "south",
    eastPlayerId: "player-a",
    southPlayerId: "player-b",
    players: {
      east: { id: "player-a", seat: "east", hand: [], river: [], isConnected: true },
      south: { id: "player-b", seat: "south", hand: [], river: [], isConnected: true }
    },
    pendingSouthHand: [],
    wall: [],
    tenpaiSeat: null,
    guesserSeat: null,
    lockedWaits: [],
    pendingCall: null,
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: "east",
    winReason: "self_draw"
  };

  const next = startNextHandWithRotatedSeats(state);
  assert.equal(next.handNumber, 2);
  assert.equal(next.eastPlayerId, "player-b");
  assert.equal(next.southPlayerId, "player-a");
  assert.equal(next.players.east.id, "player-b");
  assert.equal(next.players.south.id, "player-a");
  assert.equal(next.players.east.hand.length, 14);
  assert.equal(next.players.south.hand.length, 13);
  assert.equal(next.currentTurn, "east");
});

test("wrong guess records all five revealed self-draw trial tiles and returns to guessing", () => {
  const state = {
    roomCode: "TRIAL1",
    phase: "guessing",
    currentTurn: "south",
    eastPlayerId: "east-player",
    southPlayerId: "south-player",
    players: {
      east: { id: "east-player", seat: "east", hand: [], river: [], isConnected: true },
      south: { id: "south-player", seat: "south", hand: [], river: [], isConnected: true }
    },
    pendingSouthHand: [],
    wall: ["1m", "2m", "3m", "4m", "6m", "5m"],
    tenpaiSeat: "east",
    guesserSeat: "south",
    lockedWaits: ["5m"],
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: null,
    winReason: null
  };

  const afterGuess = resolveGuess(state, ["7m", "8m"]);
  const afterTrial = resolveSelfDrawTrial(afterGuess);
  assert.equal(afterTrial.phase, "guessing");
  assert.equal(afterTrial.wall.length, 1);
  assert.deepEqual(afterTrial.selfDrawAttempts.at(-1).draws, ["1m", "2m", "3m", "4m", "6m"]);
  assert.equal(afterTrial.selfDrawAttempts.at(-1).won, false);
  assert.equal(afterTrial.selfDrawAttempts.at(-1).hitTile, null);
});

test("wrong guesses are recorded and cannot be repeated in the same hand", () => {
  const state = {
    roomCode: "GUESS1",
    phase: "guessing",
    currentTurn: "south",
    eastPlayerId: "east-player",
    southPlayerId: "south-player",
    players: {
      east: { id: "east-player", seat: "east", hand: [], river: [], isConnected: true },
      south: { id: "south-player", seat: "south", hand: [], river: [], isConnected: true }
    },
    pendingSouthHand: [],
    wall: ["1m", "2m", "3m", "4m", "6m", "7m"],
    tenpaiSeat: "east",
    guesserSeat: "south",
    lockedWaits: ["5m"],
    pendingCall: null,
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: null,
    winReason: null
  };

  const afterGuess = resolveGuess(state, ["7m", "8m"]);
  assert.deepEqual(afterGuess.guessHistory.at(-1).guessedTiles, ["7m", "8m"]);
  assert.deepEqual([...getPreviouslyGuessedTiles(afterGuess)].sort(), ["7m", "8m"]);
  assert.throws(() => resolveGuess({ ...afterGuess, phase: "guessing" }, ["7m", "9m"]), /不能重复猜/);
});

test("multiple guess and self-draw rounds preserve public history", () => {
  const state = {
    roomCode: "GUESS2",
    phase: "guessing",
    currentTurn: "south",
    eastPlayerId: "east-player",
    southPlayerId: "south-player",
    players: {
      east: { id: "east-player", seat: "east", hand: [], river: [], isConnected: true },
      south: { id: "south-player", seat: "south", hand: [], river: [], isConnected: true }
    },
    pendingSouthHand: [],
    wall: ["1m", "2m", "3m", "4m", "6m", "7m", "8m", "9m", "1p", "2p", "3p"],
    tenpaiSeat: "east",
    guesserSeat: "south",
    lockedWaits: ["5m"],
    pendingCall: null,
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: null,
    winReason: null
  };

  const firstGuess = resolveGuess(state, ["7m", "8m"]);
  const firstTrial = resolveSelfDrawTrial(firstGuess);
  const secondGuess = resolveGuess(firstTrial, ["9m", "1p"]);
  const secondTrial = resolveSelfDrawTrial(secondGuess);

  assert.equal(secondTrial.phase, "guessing");
  assert.deepEqual(secondTrial.guessHistory.map((guess) => guess.guessedTiles), [["7m", "8m"], ["9m", "1p"]]);
  assert.deepEqual(secondTrial.selfDrawAttempts.map((attempt) => attempt.draws), [
    ["1m", "2m", "3m", "4m", "6m"],
    ["7m", "8m", "9m", "1p", "2p"]
  ]);
  assert.equal(secondTrial.selfDrawAttempts.every((attempt) => attempt.won === false), true);
});

test("failed self-draw trial tiles are public grey hints for the next guess", () => {
  const state = {
    roomCode: "HINT1",
    phase: "guessing",
    currentTurn: "south",
    eastPlayerId: "east-player",
    southPlayerId: "south-player",
    players: {
      east: { id: "east-player", seat: "east", hand: [], river: [{ tile: "9p", source: "tedashi" }], isConnected: true },
      south: { id: "south-player", seat: "south", hand: [], river: [], isConnected: true }
    },
    pendingSouthHand: [],
    wall: [],
    tenpaiSeat: "east",
    guesserSeat: "south",
    lockedWaits: ["5m"],
    pendingCall: null,
    guessHistory: [{ guessedTiles: ["7m", "8m"], correct: false }],
    selfDrawAttempts: [{ draws: ["1m", "2m", "3m", "4m", "6m"], hitTile: null, won: false }],
    winnerSeat: null,
    winReason: null
  };

  assert.deepEqual([...getPublicHintedGuessTiles(state)].sort(), ["1m", "2m", "3m", "4m", "6m", "9p"]);
  assert.deepEqual(getGuessCandidateViewState(state, "1m"), { hinted: true, disabled: false, crossed: false });
  assert.deepEqual(getGuessCandidateViewState(state, "9p"), { hinted: true, disabled: false, crossed: false });
});

test("previously guessed tiles take priority over failed self-draw hints", () => {
  const state = {
    roomCode: "HINT2",
    phase: "guessing",
    currentTurn: "south",
    eastPlayerId: "east-player",
    southPlayerId: "south-player",
    players: {
      east: { id: "east-player", seat: "east", hand: [], river: [], isConnected: true },
      south: { id: "south-player", seat: "south", hand: [], river: [], isConnected: true }
    },
    pendingSouthHand: [],
    wall: [],
    tenpaiSeat: "east",
    guesserSeat: "south",
    lockedWaits: ["5m"],
    pendingCall: null,
    guessHistory: [{ guessedTiles: ["1m", "8m"], correct: false }],
    selfDrawAttempts: [{ draws: ["1m", "2m", "3m", "4m", "6m"], hitTile: null, won: false }],
    winnerSeat: null,
    winReason: null
  };

  assert.deepEqual(getGuessCandidateViewState(state, "1m"), { hinted: false, disabled: true, crossed: true });
  assert.deepEqual(getGuessCandidateViewState(state, "2m"), { hinted: true, disabled: false, crossed: false });
});

test("next hand clears guess and self-draw history", () => {
  const state = {
    roomCode: "NEXT2",
    phase: "game_over",
    currentTurn: "south",
    eastPlayerId: "player-a",
    southPlayerId: "player-b",
    players: {
      east: { id: "player-a", seat: "east", hand: [], river: [], isConnected: true },
      south: { id: "player-b", seat: "south", hand: [], river: [], isConnected: true }
    },
    pendingSouthHand: [],
    wall: [],
    tenpaiSeat: "east",
    guesserSeat: "south",
    lockedWaits: ["5m"],
    pendingCall: null,
    guessHistory: [{ guessedTiles: ["7m", "8m"], correct: false }],
    selfDrawAttempts: [{ draws: ["1m", "2m", "3m", "4m", "6m"], hitTile: null, won: false }],
    winnerSeat: null,
    winReason: "exhaustive_draw"
  };

  const next = startNextHandWithRotatedSeats(state);
  assert.deepEqual(next.guessHistory, []);
  assert.deepEqual(next.selfDrawAttempts, []);
  assert.deepEqual([...getPreviouslyGuessedTiles(next)], []);
});

test("requesting next hand waits until both players confirm", () => {
  const state = {
    roomCode: "REMATCH1",
    phase: "game_over",
    currentTurn: "south",
    eastPlayerId: "player-a",
    southPlayerId: "player-b",
    players: {
      east: { id: "player-a", seat: "east", hand: [], river: [], isConnected: true },
      south: { id: "player-b", seat: "south", hand: [], river: [], isConnected: true }
    },
    pendingSouthHand: [],
    wall: [],
    tenpaiSeat: "east",
    guesserSeat: "south",
    lockedWaits: ["5m"],
    pendingCall: null,
    guessHistory: [{ guessedTiles: ["5m", "9m"], correct: true }],
    selfDrawAttempts: [],
    rematchReadyPlayerIds: [],
    winnerSeat: "south",
    winReason: "guesser_correct"
  };

  const invited = requestNextHand(state, "player-a");
  assert.equal(invited.phase, "game_over");
  assert.deepEqual(invited.rematchReadyPlayerIds, ["player-a"]);

  const next = requestNextHand(invited, "player-b");
  assert.equal(next.phase, "draw_discard");
  assert.equal(next.eastPlayerId, "player-b");
  assert.equal(next.southPlayerId, "player-a");
  assert.equal(isCallPromptEnabled(next, "player-a"), true);
  assert.equal(isCallPromptEnabled(next, "player-b"), true);
  assert.equal(next.players.east.hand.length, 14);
  assert.equal(next.players.south.hand.length, 13);
  assert.deepEqual(next.rematchReadyPlayerIds, []);
});

test("spectators cannot request the next hand", () => {
  const state = {
    roomCode: "REMATCH2",
    phase: "game_over",
    currentTurn: "east",
    eastPlayerId: "player-a",
    southPlayerId: "player-b",
    players: {
      east: { id: "player-a", seat: "east", hand: [], river: [], isConnected: true },
      south: { id: "player-b", seat: "south", hand: [], river: [], isConnected: true }
    },
    pendingSouthHand: [],
    wall: [],
    tenpaiSeat: null,
    guesserSeat: null,
    lockedWaits: [],
    pendingCall: null,
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: null,
    winReason: "exhaustive_draw"
  };

  assert.throws(() => requestNextHand(state, "spectator"), /Only seated players/);
});

test("chi open meld stores the called tile at its real sorted position", () => {
  const state = callState({
    tile: "5s",
    type: "chi",
    southHand: ["4s", "6s", "1m", "2m", "3m"]
  });

  const next = takeCall(state, "south", "chi");
  const meld = next.players.south.melds.at(-1);
  assert.deepEqual(meld.tiles, ["4s", "5s", "6s"]);
  assert.equal(meld.calledTileIndex, 1);
  assert.equal(meld.calledTile, "5s");
  assert.deepEqual(next.players.east.river, []);
});

test("multiple chi options are detected for the same discard", () => {
  const options = getChiOptions("7s", ["6s", "7s", "8s", "9s", "1m"]);
  assert.deepEqual(options.map((option) => option.tiles), [
    ["6s", "7s", "8s"],
    ["7s", "8s", "9s"]
  ]);
  assert.deepEqual(options.map((option) => option.calledTileIndex), [1, 0]);
});

test("taking chi with multiple options asks for a chi pattern before creating a meld", () => {
  const state = callState({
    tile: "7s",
    type: "chi",
    southHand: ["6s", "7s", "8s", "9s", "1m"]
  });

  const choosing = takeCall(state, "south", "chi");
  assert.equal(choosing.pendingCall.responderSeat, "south");
  assert.equal(choosing.pendingCall.pendingChiOptions.length, 2);
  assert.equal(choosing.players.south.melds.length, 0);
  assert.deepEqual(choosing.players.east.river, ["7s"]);
});

test("selecting a chi option creates the chosen meld with the correct called tile index", () => {
  const state = callState({
    tile: "7s",
    type: "chi",
    southHand: ["6s", "7s", "8s", "9s", "1m"]
  });

  const choosing = takeCall(state, "south", "chi");
  const next = takeChiOption(choosing, "south", 1);
  const meld = next.players.south.melds.at(-1);
  assert.deepEqual(meld.tiles, ["7s", "8s", "9s"]);
  assert.deepEqual(next.players.south.hand, ["1m", "6s", "7s"]);
  assert.equal(meld.calledTileIndex, 0);
  assert.equal(meld.calledTile, "7s");
  assert.equal(next.pendingCall, null);
  assert.deepEqual(next.players.east.river, []);
});

test("pon open meld stores the middle tile as sideways", () => {
  const state = callState({
    tile: "5p",
    type: "pon",
    southHand: ["5p", "5p", "1m", "2m", "3m"]
  });

  const next = takeCall(state, "south", "pon");
  const meld = next.players.south.melds.at(-1);
  assert.deepEqual(meld.tiles, ["5p", "5p", "5p"]);
  assert.equal(meld.calledTileIndex, 1);
});

test("kan open meld stores the second tile as sideways and delays dora reveal", () => {
  const state = callState({
    tile: "7m",
    type: "kan",
    southHand: ["7m", "7m", "7m", "1p", "2p"],
    wall: ["8s"],
    rinshanTiles: ["9s", "1s", "2s", "3s"],
    revealedDoraCount: 1
  });

  const next = takeCall(state, "south", "kan");
  const meld = next.players.south.melds.at(-1);
  assert.deepEqual(meld.tiles, ["7m", "7m", "7m", "7m"]);
  assert.equal(meld.calledTileIndex, 1);
  assert.deepEqual(getMeldTileViews(meld).map((view) => view.sideways), [false, true, false, false]);
  assert.deepEqual(getMeldTileViews(meld).map((view) => view.hidden), [false, false, false, false]);
  assert.equal(next.players.south.drawnTile, "9s");
  assert.deepEqual(next.wall, ["8s"]);
  assert.deepEqual(next.rinshanTiles, ["1s", "2s", "3s"]);
  assert.equal(next.revealedDoraCount, 1);
  assert.equal(next.pendingDoraRevealAfterDiscardSeat, "south");
});

test("open kan reveals one dora indicator after the kan player discards and only once", () => {
  const state = callState({
    tile: "7m",
    type: "kan",
    southHand: ["7m", "7m", "7m", "1p", "2p"],
    wall: ["8s", "9p"],
    rinshanTiles: ["9s", "1s", "2s", "3s"],
    revealedDoraCount: 1
  });

  const afterKan = takeCall(state, "south", "kan");
  const afterDiscard = takeDiscard(afterKan, "south", "9s", "drawn");
  assert.equal(afterDiscard.revealedDoraCount, 2);
  assert.equal(afterDiscard.pendingDoraRevealAfterDiscardSeat, null);

  const afterNormalDiscard = takeDiscard(afterDiscard, "east", "8s", "drawn");
  assert.equal(afterNormalDiscard.revealedDoraCount, 2);
});

test("dora indicators do not exceed five visible indicators after delayed kan reveal", () => {
  const state = callState({
    tile: "7m",
    type: "kan",
    southHand: ["7m", "7m", "7m", "1p", "2p"],
    wall: ["9s"],
    rinshanTiles: ["8s"],
    revealedDoraCount: 5
  });

  const afterKan = takeCall(state, "south", "kan");
  const next = takeDiscard(afterKan, "south", "8s", "drawn");
  assert.equal(next.revealedDoraCount, 5);
  assert.equal(next.pendingDoraRevealAfterDiscardSeat, null);
});

test("self-draw trial stops early when a revealed tile hits the locked wait", () => {
  const state = {
    roomCode: "TRIAL2",
    phase: "self_draw_trial",
    currentTurn: "south",
    eastPlayerId: "east-player",
    southPlayerId: "south-player",
    players: {
      east: { id: "east-player", seat: "east", hand: [], river: [], isConnected: true },
      south: { id: "south-player", seat: "south", hand: [], river: [], isConnected: true }
    },
    pendingSouthHand: [],
    wall: ["1m", "2m", "5m", "4m", "6m"],
    tenpaiSeat: "east",
    guesserSeat: "south",
    lockedWaits: ["5m"],
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: null,
    winReason: null
  };

  const afterTrial = resolveSelfDrawTrial(state);
  assert.equal(afterTrial.phase, "game_over");
  assert.equal(afterTrial.winnerSeat, "east");
  assert.equal(afterTrial.wall.length, 2);
  assert.deepEqual(afterTrial.selfDrawAttempts.at(-1).draws, ["1m", "2m", "5m"]);
  assert.equal(afterTrial.selfDrawAttempts.at(-1).won, true);
  assert.equal(afterTrial.selfDrawAttempts.at(-1).hitTile, "5m");
});

function callState({ tile, type, southHand, wall = [], rinshanTiles = ["9s"], revealedDoraCount = 1 }) {
  return {
    roomCode: "CALL1",
    phase: "draw_discard",
    currentTurn: "south",
    eastPlayerId: "east-player",
    southPlayerId: "south-player",
    players: {
      east: { id: "east-player", seat: "east", hand: [], river: [tile], isConnected: true },
      south: { id: "south-player", seat: "south", hand: southHand, river: [], melds: [], isConnected: true }
    },
    pendingSouthHand: [],
    wall,
    deadWall: ["1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "1s", "2s", "3s", "4s", "5s"],
    doraIndicators: ["1p", "2p", "3p", "4p", "5p"],
    uraDoraIndicators: ["6p", "7p", "8p", "9p", "1s"],
    rinshanTiles,
    revealedDoraCount,
    tenpaiSeat: null,
    guesserSeat: null,
    lockedWaits: [],
    pendingCall: {
      discarderSeat: "east",
      responderSeat: "south",
      tile,
      options: [type]
    },
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: null,
    winReason: null
  };
}

function addedKanState({
  hand = ["5p", "1m", "2m", "3m", "4m", "6m", "7m", "8m", "9m", "E", "S", "W", "C"],
  melds = [{ type: "pon", tiles: ["5p", "5p", "5p"], calledTileIndex: 1, calledTile: "5p", fromSeat: "south" }]
} = {}) {
  return {
    roomCode: "ADDED1",
    phase: "draw_discard",
    currentTurn: "east",
    eastPlayerId: "east-player",
    southPlayerId: "south-player",
    players: {
      east: {
        id: "east-player",
        seat: "east",
        hand,
        river: [],
        melds,
        isConnected: true
      },
      south: {
        id: "south-player",
        seat: "south",
        hand: ["1p", "2p", "3p", "4p", "6p", "8p", "9p", "4s", "6s", "8s", "N", "P", "F"],
        drawnTile: "9m",
        river: [],
        melds: [],
        isConnected: true
      }
    },
    pendingSouthHand: [],
    wall: ["8s"],
    deadWall: ["1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "1s", "2s", "3s", "4s", "5s"],
    doraIndicators: ["1p", "2p", "3p", "4p", "5p"],
    uraDoraIndicators: ["6p", "7p", "8p", "9p", "1s"],
    rinshanTiles: ["2s", "3s", "4s", "5s"],
    revealedDoraCount: 1,
    tenpaiSeat: null,
    guesserSeat: null,
    lockedWaits: [],
    pendingCall: null,
    callPromptSettings: {
      "east-player": true,
      "south-player": true
    },
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: null,
    winReason: null
  };
}

function callPromptDiscardState(southCallPromptEnabled) {
  return {
    roomCode: "PROMPT1",
    phase: "draw_discard",
    currentTurn: "east",
    eastPlayerId: "east-player",
    southPlayerId: "south-player",
    players: {
      east: {
        id: "east-player",
        seat: "east",
        hand: ["1m", "1m", "2m", "2m", "3m", "3m", "4p", "5p", "6p", "5s", "7s", "8s", "E", "C"],
        river: [],
        isConnected: true
      },
      south: {
        id: "south-player",
        seat: "south",
        hand: ["1p", "2p", "4s", "6s", "9m", "9p", "1s", "2s", "3s", "N", "P", "F", "C"],
        river: [],
        isConnected: true
      }
    },
    pendingSouthHand: [],
    wall: ["9m", "8p"],
    tenpaiSeat: null,
    guesserSeat: null,
    lockedWaits: [],
    pendingCall: null,
    callPromptSettings: {
      "east-player": true,
      "south-player": southCallPromptEnabled
    },
    guessHistory: [],
    selfDrawAttempts: [],
    winnerSeat: null,
    winReason: null
  };
}
