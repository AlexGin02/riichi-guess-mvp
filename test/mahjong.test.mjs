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
  forceKnownTenpaiSetup,
  getChiOptions,
  getPreviouslyGuessedTiles,
  joinGame,
  resetGameKeepingPlayers,
  requestNextHand,
  resolveGuess,
  resolveSelfDrawTrial,
  startNextHandWithRotatedSeats,
  takeCall,
  takeChiOption,
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

test("kan open meld stores the second tile as sideways", () => {
  const state = callState({
    tile: "7m",
    type: "kan",
    southHand: ["7m", "7m", "7m", "1p", "2p"],
    wall: ["9s"]
  });

  const next = takeCall(state, "south", "kan");
  const meld = next.players.south.melds.at(-1);
  assert.deepEqual(meld.tiles, ["7m", "7m", "7m", "7m"]);
  assert.equal(meld.calledTileIndex, 1);
  assert.equal(next.players.south.drawnTile, "9s");
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

function callState({ tile, type, southHand, wall = [] }) {
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
