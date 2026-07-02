"use client";

import { useEffect, useMemo, useState } from "react";
import { TileButton } from "@/components/TileButton";
import {
  CallType,
  GameState,
  OpenMeld,
  RiverTile,
  forceKnownTenpaiSetup,
  getGuessCandidateViewState,
  getPreviouslyGuessedTiles,
  riverTileSource,
  riverTileValue,
  requestNextHand,
  resolveGuess,
  resolveSelfDrawTrial,
  skipCall,
  takeCall,
  takeChiOption,
  takeDiscard
} from "@/lib/game";
import { TILE_TYPES, Tile } from "@/lib/mahjong";
import { getSupabaseClient, RoomRow } from "@/lib/supabase";
import {
  createRoom,
  getOrCreatePlayerId,
  joinRoom,
  saveGameState,
  seatForPlayer
} from "@/lib/room-store";

const PHASE_LABELS: Record<GameState["phase"], string> = {
  waiting: "等待",
  draw_discard: "摸切",
  guessing: "猜听牌",
  self_draw_trial: "自摸试抽",
  game_over: "游戏结束"
};

export default function Home() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [playerId, setPlayerId] = useState("");
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [selectedGuess, setSelectedGuess] = useState<Tile[]>([]);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [autoJoinAttempted, setAutoJoinAttempted] = useState(false);

  const state = room?.game_state as GameState | undefined;
  const actualSeat = state && playerId ? seatForPlayer(state, playerId) : null;
  const seat = actualSeat;
  const player = seat ? state?.players[seat] : null;
  const isMyTurn = Boolean(state && seat && state.currentTurn === seat && state.phase === "draw_discard" && !state.pendingCall);
  const pendingCallForMe = Boolean(state?.pendingCall && seat === state.pendingCall.responderSeat);
  const seatLabel = seat === "east" ? "你是东家" : seat === "south" ? "你是南家" : "你是观战者";
  const turnLabel = state?.phase === "draw_discard" && seat ? (isMyTurn ? "你的回合" : "等待对手") : "";
  const shareUrl =
    typeof window === "undefined" || !state ? "" : `${window.location.origin}${window.location.pathname}?room=${state.roomCode}`;

  useEffect(() => {
    const id = getOrCreatePlayerId();
    setPlayerId(id);

    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get("room");
    if (roomFromUrl) {
      setJoinCode(roomFromUrl.toUpperCase());
    }
  }, []);

  useEffect(() => {
    if (!supabase || !playerId || room || autoJoinAttempted) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get("room")?.trim().toUpperCase();
    if (!roomFromUrl) {
      return;
    }

    setAutoJoinAttempted(true);
    void runAction(async () => {
      const joined = await joinRoom(supabase, roomFromUrl, playerId);
      setRoom(joined);
    });
  }, [autoJoinAttempted, playerId, room, supabase]);

  useEffect(() => {
    if (!supabase || !room) {
      return;
    }

    const channel = supabase
      .channel(`room-${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
        (payload) => setRoom(payload.new as RoomRow)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [room?.id, supabase]);

  useEffect(() => {
    if (!state) {
      return;
    }
    const guessedTiles = getPreviouslyGuessedTiles(state);
    setSelectedGuess((current) => current.filter((tile) => !guessedTiles.has(tile)));
  }, [state?.guessHistory]);

  async function runAction(action: () => Promise<void>) {
    setMessage("");
    setIsBusy(true);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setIsBusy(false);
    }
  }

  async function writeState(nextState: GameState) {
    if (!room) {
      throw new Error("Supabase 未配置。");
    }
    if (!supabase) {
      throw new Error("Supabase 未配置。");
    }
    const updated = await saveGameState(supabase, room.id, nextState);
    setRoom(updated);
  }

  if (!supabase && !room) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-5 py-8">
        <section className="rounded border border-amber-300 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-bold">Riichi Guess</h1>
          <p className="mt-3 text-stone-700">
            请先配置 Supabase URL 和 anon key。此版本只支持远程双人实时对战，不提供本地一人控制双方模式。
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 px-3 py-4 sm:px-5">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-stone-300 bg-white/90 px-4 py-3 shadow-sm">
        <div>
          <h1 className="text-2xl font-black tracking-normal text-ink">Riichi Guess</h1>
          <p className="text-sm font-semibold text-stone-600">远程双人实时麻将猜听牌</p>
        </div>
        {state && (
          <div className="flex flex-wrap justify-end gap-2 text-sm">
            <StatusPill label="房间" value={state.roomCode} tone="felt" />
            <StatusPill label="阶段" value={PHASE_LABELS[state.phase]} tone="ink" />
            <StatusPill label="牌山剩余" value={state.wall.length > 0 ? `${state.wall.length}` : "已耗尽"} tone={state.wall.length > 0 ? "stone" : "ember"} />
            <StatusPill label="座位" value={seatLabel} tone="stone" />
            {turnLabel && <StatusPill label="回合" value={turnLabel} tone={isMyTurn ? "ember" : "stone"} />}
          </div>
        )}
      </header>

      {!state ? (
        <section className="grid gap-4 rounded border border-stone-300 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr]">
          <button
            type="button"
            disabled={isBusy || !playerId}
            onClick={() =>
              runAction(async () => {
                if (!supabase) {
                  throw new Error("Supabase is not configured.");
                }
                const created = await createRoom(supabase, playerId);
                setRoom(created);
              })
            }
            className="rounded bg-felt px-4 py-3 font-bold text-white disabled:opacity-50"
          >
            创建房间（东家）
          </button>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void runAction(async () => {
                if (!supabase) {
                  throw new Error("Supabase is not configured.");
                }
                const joined = await joinRoom(supabase, joinCode.trim(), playerId);
                setRoom(joined);
              });
            }}
          >
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="房间码"
              className="min-w-0 flex-1 rounded border border-stone-300 px-3 py-3 uppercase"
            />
            <button type="submit" disabled={isBusy || !playerId || joinCode.trim().length === 0} className="rounded bg-ink px-4 py-3 font-bold text-white disabled:opacity-50">
              加入房间（南家）
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="grid gap-3 rounded-md border border-stone-300 bg-white/90 p-4 shadow-sm md:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="text-sm font-bold text-stone-600">分享链接</div>
              <div className="mt-1 break-all rounded-md border border-stone-200 bg-paper px-3 py-2 text-sm">{shareUrl}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <SeatStatus label="东家" active={Boolean(state.players.east)} current={state.currentTurn === "east"} mine={seat === "east"} />
              <SeatStatus label="南家" active={Boolean(state.players.south)} current={state.currentTurn === "south"} mine={seat === "south"} />
            </div>
          </section>

          {state.phase === "waiting" && (
            <section className="rounded border border-stone-300 bg-white p-4 shadow-sm">
              <p className="font-bold">等待南家加入。把上面的链接发给你的朋友。</p>
            </section>
          )}

          <section className="grid gap-4 lg:grid-cols-[1fr_500px]">
            <div className="grid gap-4">
              <div className="grid gap-4 xl:grid-cols-2">
                <River title="东家牌河" seat="east" tiles={state.players.east?.river ?? []} current={state.currentTurn === "east"} />
                <River title="南家牌河" seat="south" tiles={state.players.south?.river ?? []} current={state.currentTurn === "south"} />
              </div>
            </div>

            <aside className="space-y-4">
              <PhasePanel
                state={state}
                seat={seat}
                selectedGuess={selectedGuess}
                setSelectedGuess={setSelectedGuess}
                isBusy={isBusy}
                onGuess={() =>
                  runAction(async () => {
                    if (seat !== state.guesserSeat) {
                      throw new Error("只有猜牌方可以操作。");
                    }
                    await writeState(resolveGuess(state, selectedGuess));
                    setSelectedGuess([]);
                  })
                }
                onSelfDraw={() =>
                  runAction(async () => {
                    if (seat !== state.tenpaiSeat) {
                      throw new Error("只有听牌方可以试抽。");
                    }
                    await writeState(resolveSelfDrawTrial(state));
                  })
                }
                onReset={() =>
                  runAction(async () => {
                    if (!seat || !playerId) {
                      throw new Error("只有本房间玩家可以重开。");
                    }
                    await writeState(requestNextHand(state, playerId));
                  })
                }
                onForceTenpai={() =>
                  runAction(async () => {
                    if (!seat || seat !== state.currentTurn) {
                      throw new Error("只有当前回合玩家可以使用测试模式。");
                    }
                    await writeState(forceKnownTenpaiSetup(state, seat));
                  })
                }
                onCall={(type) =>
                  runAction(async () => {
                    if (!seat || !state.pendingCall || state.pendingCall.responderSeat !== seat) {
                      throw new Error("只有可鸣牌的一方可以操作。");
                    }
                    await writeState(takeCall(state, seat, type));
                  })
                }
                onChiOption={(optionIndex) =>
                  runAction(async () => {
                    if (!seat || !state.pendingCall || state.pendingCall.responderSeat !== seat) {
                      throw new Error("只有可鸣牌的一方可以操作。");
                    }
                    await writeState(takeChiOption(state, seat, optionIndex));
                  })
                }
                onSkipCall={() =>
                  runAction(async () => {
                    if (!seat || !state.pendingCall || state.pendingCall.responderSeat !== seat) {
                      throw new Error("只有可鸣牌的一方可以操作。");
                    }
                    await writeState(skipCall(state, seat));
                  })
                }
              />
              <OpenMeldsPanel state={state} />
            </aside>
          </section>

          {player && (
            <section className="sticky bottom-0 z-10 -mx-3 border-t border-stone-300 bg-[#f3eadc]/95 px-3 py-3 shadow-[0_-14px_30px_rgba(23,33,28,0.12)] backdrop-blur sm:-mx-5 sm:px-5">
              <div className="mx-auto max-w-7xl rounded-md border border-stone-300 bg-white p-4 shadow-lg">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xl font-black text-ink">你的手牌 · {seat === "east" ? "东家" : "南家"}</h2>
                    <p className="text-sm font-bold text-stone-600">{turnLabel || PHASE_LABELS[state.phase]}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-paper px-3 py-2 text-sm font-black text-stone-700">牌山剩余：{state.wall.length > 0 ? state.wall.length : "已耗尽"}</span>
                  </div>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-3 pt-1">
                  {player.hand.map((tile, index) => (
                    <TileButton
                      key={`${tile}-${index}`}
                      tile={tile}
                      disabled={!isMyTurn || pendingCallForMe || isBusy}
                      onClick={() =>
                        void runAction(async () => {
                          if (!seat || state.currentTurn !== seat || state.pendingCall) {
                            throw new Error("还没轮到你。");
                          }
                          await writeState(takeDiscard(state, seat, tile, "hand"));
                        })
                      }
                    />
                  ))}
                  {player.drawnTile && (
                    <div className="ml-8 flex items-center">
                      <TileButton
                        tile={player.drawnTile}
                        disabled={!isMyTurn || pendingCallForMe || isBusy}
                        onClick={() =>
                          void runAction(async () => {
                            if (!seat || state.currentTurn !== seat || state.pendingCall || !player.drawnTile) {
                              throw new Error("还没轮到你。");
                            }
                            await writeState(takeDiscard(state, seat, player.drawnTile, "drawn"));
                          })
                        }
                      />
                    </div>
                  )}
                </div>
                {isMyTurn && <div className="mt-1 rounded-md bg-jade px-3 py-2 text-sm font-black text-ink">请选择一张牌打出。</div>}
              </div>
            </section>
          )}
        </>
      )}

      {message && <div className="rounded border border-ember bg-white px-4 py-3 text-sm font-bold text-ember">{message}</div>}
    </main>
  );
}

function StatusPill({ label, value, tone }: { label: string; value: string; tone: "felt" | "ink" | "ember" | "stone" }) {
  const toneClasses = {
    felt: "border-felt bg-jade text-felt",
    ink: "border-ink bg-ink text-white",
    ember: "border-ember bg-ember text-white",
    stone: "border-stone-300 bg-paper text-stone-700"
  };

  return (
    <div className={`rounded-md border px-3 py-2 font-bold shadow-sm ${toneClasses[tone]}`}>
      <span className="mr-1 text-xs uppercase opacity-75">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function SeatStatus({ label, active, current, mine }: { label: string; active: boolean; current: boolean; mine: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${current ? "border-ember bg-amber-50" : "border-stone-200 bg-paper"}`}>
      <div className="font-bold">{label}</div>
      <div className="font-semibold text-stone-600">{active ? "已入座" : "空位"}{current ? " · 当前回合" : ""}{mine ? " · 你" : ""}</div>
    </div>
  );
}

function River({ title, seat, tiles, current }: { title: string; seat: "east" | "south"; tiles: RiverTile[]; current: boolean }) {
  return (
    <section className={`min-h-[180px] rounded-md border bg-[#efe5d2] p-4 shadow-sm ${current ? "border-ember" : "border-stone-300"}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-black text-ink">{title}</h2>
        <span className={`rounded-md px-2 py-1 text-xs font-black uppercase ${current ? "bg-ember text-white" : "bg-white text-stone-600"}`}>{seat === "east" ? "东" : "南"}</span>
      </div>
      <div className="grid min-h-24 grid-cols-6 content-start gap-3 rounded-md border border-stone-300 bg-[#1f6b5a] p-3">
        {tiles.map((entry, index) => {
          const tile = riverTileValue(entry);
          const showTedashiMarker = riverTileSource(entry) === "tedashi";
          return (
            <div key={`${tile}-${index}`} className="relative w-fit">
              <TileButton tile={tile} size="river" disabled interactive={false} />
              {showTedashiMarker && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full border border-white/70 bg-slate-600/90 shadow-sm" aria-hidden="true" />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PhasePanel({
  state,
  seat,
  selectedGuess,
  setSelectedGuess,
  isBusy,
  onGuess,
  onSelfDraw,
  onReset,
  onForceTenpai,
  onCall,
  onChiOption,
  onSkipCall
}: {
  state: GameState;
  seat: "east" | "south" | null;
  selectedGuess: Tile[];
  setSelectedGuess: (tiles: Tile[]) => void;
  isBusy: boolean;
  onGuess: () => void;
  onSelfDraw: () => void;
  onReset: () => void;
  onForceTenpai: () => void;
  onCall: (type: CallType) => void;
  onChiOption: (optionIndex: number) => void;
  onSkipCall: () => void;
}) {
  const previouslyGuessedTiles = getPreviouslyGuessedTiles(state);
  const selectedContainsPreviousGuess = selectedGuess.some((tile) => previouslyGuessedTiles.has(tile));

  if (state.pendingCall) {
    const canRespond = seat === state.pendingCall.responderSeat;
    const chiOptions = canRespond ? state.pendingCall.pendingChiOptions ?? [] : [];
    const choosingChi = chiOptions.length > 0;
    return (
      <section className="rounded-md border border-ember bg-white p-4 shadow-sm">
        <div className="rounded-md bg-ember px-3 py-2 text-white">
          <h2 className="font-black">{choosingChi ? "选择吃法" : "正在思考..."}</h2>
          <p className="text-sm font-semibold text-white/90">
            {choosingChi ? "请选择要组成的顺子。" : canRespond ? "你可以对这张弃牌进行操作。" : "等待对手进行操作。"}
          </p>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-md bg-paper p-3">
          <span className="text-sm font-black text-stone-700">对方打出</span>
          <TileButton tile={state.pendingCall.tile} disabled interactive={false} />
        </div>
        {choosingChi ? (
          <div className="mt-4 space-y-2">
            {chiOptions.map((option, optionIndex) => (
              <button
                key={`${option.tiles.join("-")}-${optionIndex}`}
                type="button"
                disabled={isBusy}
                onClick={() => onChiOption(optionIndex)}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-stone-300 bg-paper px-3 py-2 text-left shadow-sm transition hover:border-felt hover:bg-jade disabled:opacity-50"
              >
                <span className="text-sm font-black text-stone-700">吃法 {optionIndex + 1}</span>
                <ChiOptionTiles tiles={option.tiles} calledTileIndex={option.calledTileIndex} />
              </button>
            ))}
            <button type="button" disabled={isBusy} onClick={onSkipCall} className="w-full rounded-md bg-stone-700 px-4 py-3 font-black text-white disabled:opacity-50">
              跳过
            </button>
          </div>
        ) : canRespond && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {state.pendingCall.options.includes("chi") && (
              <button type="button" disabled={isBusy} onClick={() => onCall("chi")} className="rounded-md bg-felt px-4 py-3 font-black text-white disabled:opacity-50">
                吃
              </button>
            )}
            {state.pendingCall.options.includes("pon") && (
              <button type="button" disabled={isBusy} onClick={() => onCall("pon")} className="rounded-md bg-felt px-4 py-3 font-black text-white disabled:opacity-50">
                碰
              </button>
            )}
            {state.pendingCall.options.includes("kan") && (
              <button type="button" disabled={isBusy} onClick={() => onCall("kan")} className="rounded-md bg-felt px-4 py-3 font-black text-white disabled:opacity-50">
                杠
              </button>
            )}
            <button type="button" disabled={isBusy} onClick={onSkipCall} className="rounded-md bg-stone-700 px-4 py-3 font-black text-white disabled:opacity-50">
              跳过
            </button>
          </div>
        )}
        <PublicInfoHistory state={state} />
      </section>
    );
  }

  if (state.phase === "guessing") {
    const canGuess = seat === state.guesserSeat;
    return (
      <section className="rounded-md border border-ember bg-white p-4 shadow-sm">
        <div className="rounded-md bg-ember px-3 py-2 text-white">
          <h2 className="font-black">Ta在听什么？</h2>
          <p className="text-sm font-semibold text-white/90">{canGuess ? "选择两张可能的听牌。" : "等待对手猜听牌。"}</p>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-6 xl:grid-cols-9">
          {TILE_TYPES.map((tile) => {
            const viewState = getGuessCandidateViewState(state, tile);
            return (
              <div key={tile}>
                <TileButton
                  tile={tile}
                  size="sm"
                  disabledTone={viewState.disabled ? "guessed" : "default"}
                  tone={viewState.hinted ? "hint" : "default"}
                  crossed={viewState.crossed}
                  selected={selectedGuess.includes(tile)}
                  disabled={!canGuess || isBusy || viewState.disabled}
                  onClick={() => {
                    if (viewState.disabled) {
                      return;
                    }
                    if (selectedGuess.includes(tile)) {
                      setSelectedGuess(selectedGuess.filter((selected) => selected !== tile));
                    } else if (selectedGuess.length < 2) {
                      setSelectedGuess([...selectedGuess, tile]);
                    }
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-sm font-bold text-stone-600">已选择：{selectedGuess.length}/2</div>
        <button type="button" disabled={!canGuess || selectedGuess.length !== 2 || selectedContainsPreviousGuess || isBusy} onClick={onGuess} className="mt-3 w-full rounded-md bg-ember px-4 py-3 font-black text-white shadow-sm disabled:opacity-50">
          确认猜牌
        </button>
        <PublicInfoHistory state={state} />
      </section>
    );
  }

  if (state.phase === "self_draw_trial") {
    const canRun = seat === state.tenpaiSeat;
    return (
      <section className="rounded-md border border-felt bg-white p-4 shadow-sm">
        <div className="rounded-md bg-felt px-3 py-2 text-white">
          <h2 className="font-black">{canRun ? "没有猜中！" : "非常遗憾！"}</h2>
          <p className="text-sm font-semibold text-white/90">{canRun ? "现在是你的自摸回合。" : "现在是对手的自摸时间。"}</p>
        </div>
        <p className="mt-3 text-sm font-semibold text-stone-600">听牌形状已锁定，最多从牌山试抽 5 张。</p>
        {canRun && (
          <button type="button" disabled={isBusy} onClick={onSelfDraw} className="mt-4 w-full rounded-md bg-felt px-4 py-3 font-black text-white shadow-sm disabled:opacity-50">
            开始试抽
          </button>
        )}
        <PublicInfoHistory state={state} />
      </section>
    );
  }

  if (state.phase === "game_over") {
    const currentPlayerId = seat ? state.players[seat]?.id : null;
    const opponentPlayerId =
      currentPlayerId && currentPlayerId === state.eastPlayerId ? state.southPlayerId : currentPlayerId === state.southPlayerId ? state.eastPlayerId : null;
    const readyPlayerIds = state.rematchReadyPlayerIds ?? [];
    const isReadyForRematch = Boolean(currentPlayerId && readyPlayerIds.includes(currentPlayerId));
    const opponentReadyForRematch = Boolean(opponentPlayerId && readyPlayerIds.includes(opponentPlayerId));
    const rematchButtonText = opponentReadyForRematch && !isReadyForRematch ? "对手邀请你再来一把！" : isReadyForRematch ? "等待对手回应..." : "再来一把！";
    const rematchButtonClass =
      opponentReadyForRematch && !isReadyForRematch
        ? "border-ember bg-ember text-white shadow-[0_10px_24px_rgba(201,79,55,0.22)] hover:bg-[#b94732]"
        : "border-ink bg-ink text-white shadow-sm hover:bg-[#223027]";
    return (
      <section className="rounded-md border border-ink bg-white p-4 shadow-sm">
        <div className="rounded-md bg-ink px-3 py-2 text-white">
          <h2 className="font-black">{gameOverTitle(state)}</h2>
          <p className="text-sm font-semibold text-white/90">{gameOverText(state)}</p>
        </div>
        <TenpaiShapeReveal state={state} />
        {state.lockedWaits.length > 0 && (
          <div className="mt-3">
            <div className="text-sm font-black text-stone-600">原始听牌</div>
            <div className="mt-2 flex flex-wrap gap-2">{state.lockedWaits.map((tile) => <TileButton key={tile} tile={tile} disabled interactive={false} />)}</div>
          </div>
        )}
        <PublicInfoHistory state={state} />
        <button
          type="button"
          disabled={isBusy || !seat || isReadyForRematch}
          onClick={onReset}
          className={`mt-4 w-full rounded-md border px-4 py-3 font-black transition disabled:pointer-events-none disabled:opacity-50 ${rematchButtonClass}`}
        >
          {rematchButtonText}
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-stone-300 bg-white p-4 shadow-sm">
      <div className="rounded-md bg-paper px-3 py-2">
        <h2 className="font-black text-ink">{PHASE_LABELS[state.phase]}</h2>
        <p className="mt-1 text-sm font-bold text-stone-600">当前回合：{state.currentTurn === "east" ? "东家" : "南家"}</p>
      </div>
      {state.phase === "draw_discard" && seat === state.currentTurn && !state.pendingCall && (
        <DevTestControls disabled={isBusy} onForceTenpai={onForceTenpai} />
      )}
      <PublicInfoHistory state={state} />
    </section>
  );
}

function OpenMeldsPanel({ state }: { state: GameState }) {
  const eastMelds = state.players.east?.melds ?? [];
  const southMelds = state.players.south?.melds ?? [];
  const hasMelds = eastMelds.length > 0 || southMelds.length > 0;

  if (!hasMelds) {
    return null;
  }

  return (
    <section className="rounded-md border border-stone-300 bg-white p-4 shadow-sm">
      <h2 className="font-bold">公开副露</h2>
      <MeldRow title="东家" melds={eastMelds} />
      <MeldRow title="南家" melds={southMelds} />
    </section>
  );
}

function MeldRow({ title, melds }: { title: string; melds: NonNullable<GameState["players"]["east"]>["melds"] }) {
  if (!melds || melds.length === 0) {
    return null;
  }

  return (
    <div className="mt-3">
      <div className="mb-2 text-sm font-black text-stone-600">{title}</div>
      <div className="flex flex-wrap gap-3">
        {melds.map((meld, meldIndex) => (
          <div key={`${meld.type}-${meldIndex}`} className="rounded-md border border-stone-200 bg-paper p-2">
            <div className="mb-2 text-xs font-black text-stone-600">{callLabel(meld.type)}</div>
            <OpenMeldTiles meld={meld} />
          </div>
        ))}
      </div>
    </div>
  );
}

function OpenMeldTiles({ meld }: { meld: OpenMeld }) {
  const calledTileIndex = getCalledTileIndex(meld);
  return <SidewaysTileGroup tiles={meld.tiles} calledTileIndex={calledTileIndex} />;
}

function ChiOptionTiles({ tiles, calledTileIndex }: { tiles: Tile[]; calledTileIndex: number }) {
  return <SidewaysTileGroup tiles={tiles} calledTileIndex={calledTileIndex} />;
}

function SidewaysTileGroup({ tiles, calledTileIndex }: { tiles: Tile[]; calledTileIndex: number }) {
  return (
    <div className="flex min-h-[62px] items-center gap-1.5">
      {tiles.map((tile, tileIndex) => {
        const sideways = tileIndex === calledTileIndex;
        return (
          <div key={`${tile}-${tileIndex}`} className={sideways ? "grid h-[44px] w-[62px] place-items-center" : "grid h-[62px] w-[43px] place-items-center"}>
            <div className={sideways ? "rotate-90" : undefined}>
              <TileButton tile={tile} size="river" disabled interactive={false} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getCalledTileIndex(meld: OpenMeld): number {
  if (Number.isInteger(meld.calledTileIndex)) {
    return meld.calledTileIndex;
  }
  if (meld.type === "pon" || meld.type === "kan") {
    return 1;
  }
  return Math.max(0, meld.tiles.indexOf(meld.calledTile));
}

function callLabel(type: CallType): string {
  if (type === "chi") {
    return "吃";
  }
  if (type === "pon") {
    return "碰";
  }
  return "杠";
}

function DevTestControls({ disabled, onForceTenpai }: { disabled: boolean; onForceTenpai: () => void }) {
  return (
    <div className="mt-4 rounded-md border border-dashed border-ember/70 bg-amber-50 p-3">
      <div className="text-xs font-black uppercase text-ember">DEV TEST MODE</div>
      <p className="mt-1 text-xs font-semibold text-stone-700">只影响你的手牌。强制听牌后打出 9m，听 5m。</p>
      <button type="button" disabled={disabled} onClick={onForceTenpai} className="mt-3 w-full rounded-md bg-ember px-3 py-2 text-sm font-black text-white shadow-sm disabled:opacity-50">
        强制我的手牌进入测试听牌
      </button>
    </div>
  );
}

function TenpaiShapeReveal({ state }: { state: GameState }) {
  if (!state.tenpaiSeat) {
    return null;
  }

  const tenpaiPlayer = state.players[state.tenpaiSeat];
  if (!tenpaiPlayer) {
    return null;
  }

  return (
    <div className="mt-3 rounded-md border border-stone-200 bg-paper p-3">
      <div className="text-sm font-black text-stone-700">听牌人牌型 · {state.tenpaiSeat === "east" ? "东家" : "南家"}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {tenpaiPlayer.hand.map((tile, index) => (
          <TileButton key={`${tile}-${index}`} tile={tile} size="info" disabled interactive={false} />
        ))}
      </div>
      {(tenpaiPlayer.melds ?? []).length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-black text-stone-600">副露</div>
          {(tenpaiPlayer.melds ?? []).map((meld, meldIndex) => (
            <div key={`${meld.type}-${meldIndex}`} className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-black text-stone-600">{callLabel(meld.type)}</span>
              <OpenMeldTiles meld={meld} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PublicInfoHistory({ state }: { state: GameState }) {
  const guessHistory = state.guessHistory ?? [];
  const selfDrawAttempts = state.selfDrawAttempts ?? [];
  if (guessHistory.length === 0 && selfDrawAttempts.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="text-sm font-black text-stone-700">公开信息</div>
      {guessHistory.map((guess, roundIndex) => {
        const attempt = selfDrawAttempts[roundIndex];
        const hitIndex = attempt?.hitTile ? attempt.draws.findIndex((tile) => tile === attempt.hitTile) : -1;
        return (
          <div key={`round-${roundIndex}-${guess.guessedTiles.join("-")}`} className="rounded-md border border-stone-200 bg-paper p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-20 shrink-0 text-sm font-black text-stone-700">第{roundIndex + 1}轮猜牌</div>
              <div className="flex flex-wrap gap-1.5">
                {guess.guessedTiles.map((tile, tileIndex) => (
                  <TileButton key={`${tile}-${tileIndex}`} tile={tile} size="info" disabled interactive={false} />
                ))}
              </div>
            </div>
            {attempt ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="w-20 shrink-0 text-sm font-black text-stone-700">第{roundIndex + 1}轮自摸</div>
                <div className="flex flex-wrap gap-1.5">
                  {attempt.draws.map((tile, index) => (
                    <TileButton key={`${tile}-${index}`} tile={tile} size="info" disabled selected={attempt.hitTile === tile} interactive={false} />
                  ))}
                </div>
                <div className={`ml-auto rounded-md px-2 py-1 text-xs font-black ${attempt.won ? "bg-felt text-white" : "bg-stone-200 text-stone-700"}`}>
                  {attempt.won && hitIndex >= 0 ? `结果：第 ${hitIndex + 1} 张自摸成功` : "结果：未命中"}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm font-bold text-stone-500">{guess.correct ? "猜中，游戏结束。" : "等待自摸挑战。"}</div>
            )}
          </div>
        );
      })}
      {selfDrawAttempts.slice(guessHistory.length).map((attempt, extraIndex) => {
        const hitIndex = attempt.hitTile ? attempt.draws.findIndex((tile) => tile === attempt.hitTile) : -1;
        return (
          <div key={`extra-${extraIndex}-${attempt.draws.join("-")}`} className="rounded-md border border-stone-200 bg-paper p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-20 shrink-0 text-sm font-black text-stone-700">自摸挑战</div>
              <div className="flex flex-wrap gap-1.5">
                {attempt.draws.map((tile, index) => (
                  <TileButton key={`${tile}-${index}`} tile={tile} size="info" disabled selected={attempt.hitTile === tile} interactive={false} />
                ))}
              </div>
              <div className={`ml-auto rounded-md px-2 py-1 text-xs font-black ${attempt.won ? "bg-felt text-white" : "bg-stone-200 text-stone-700"}`}>
                {attempt.won && hitIndex >= 0 ? `结果：第 ${hitIndex + 1} 张自摸成功` : "结果：未命中"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function gameOverText(state: GameState): string {
  if (state.winReason === "guesser_correct") {
    return `${state.winnerSeat === "east" ? "东家" : "南家"}猜中听牌获胜。`;
  }
  if (state.winReason === "self_draw") {
    return `${state.winnerSeat === "east" ? "东家" : "南家"}在 5 次试抽内自摸获胜。`;
  }
  return "牌山耗尽，流局。";
}

function gameOverTitle(state: GameState): string {
  if (state.winReason === "guesser_correct") {
    return "猜对了！";
  }
  if (state.winReason === "self_draw") {
    return "自摸！";
  }
  return "流局";
}
