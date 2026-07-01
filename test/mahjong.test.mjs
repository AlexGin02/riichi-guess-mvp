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
  joinGame,
  resetGameKeepingPlayers,
  resolveGuess,
  resolveSelfDrawTrial,
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
  assert.deepEqual(next.players.east.river, ["C"]);
  assert.equal(next.players.east.hand.length, 13);
  assert.equal(next.players.south.hand.length, 14);
  assert.equal(next.players.south.hand.includes("9m"), true);
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
