import { Tile, tileLabel } from "@/lib/mahjong";
import clsx from "clsx";

type Props = {
  tile: Tile;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

export function TileButton({ tile, selected = false, disabled = false, onClick }: Props) {
  const face = getTileFace(tile);
  const isInteractive = Boolean(onClick) && !disabled;

  return (
    <button
      type="button"
      aria-label={tileLabel(tile)}
      title={tileLabel(tile)}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "relative flex h-[72px] w-[50px] shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white shadow-[0_5px_0_rgba(120,113,108,0.35),0_10px_18px_rgba(23,33,28,0.14)] transition sm:h-20 sm:w-14",
        selected
          ? "border-ember ring-4 ring-ember/35 -translate-y-1"
          : "border-stone-300 ring-1 ring-white/80",
        isInteractive && "hover:-translate-y-1 hover:border-felt hover:shadow-[0_7px_0_rgba(22,101,52,0.34),0_14px_22px_rgba(23,33,28,0.18)]",
        disabled && "cursor-not-allowed",
        disabled && onClick && "opacity-65"
      )}
    >
      <span className={clsx("block translate-y-[1px] text-[58px] leading-none sm:text-[66px]", face.color)}>{face.main}</span>
      {selected && <span className="absolute -right-1 -top-1 rounded-full bg-ember px-1.5 py-0.5 text-[10px] font-black text-white">✓</span>}
    </button>
  );
}

export function TileBack() {
  return (
    <div className="flex h-[72px] w-[50px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-emerald-950 bg-white shadow-[0_5px_0_rgba(20,83,45,0.45),0_10px_18px_rgba(23,33,28,0.16)] sm:h-20 sm:w-14">
      <span className="block translate-y-[1px] text-[58px] leading-none sm:text-[66px]">🀫</span>
    </div>
  );
}

function getTileFace(tile: Tile): { main: string; color: string } {
  const manzu: Record<string, string> = {
    "1": "🀇︎",
    "2": "🀈︎",
    "3": "🀉︎",
    "4": "🀊︎",
    "5": "🀋︎",
    "6": "🀌︎",
    "7": "🀍︎",
    "8": "🀎︎",
    "9": "🀏︎"
  };
  const souzu: Record<string, string> = {
    "1": "🀐︎",
    "2": "🀑︎",
    "3": "🀒︎",
    "4": "🀓︎",
    "5": "🀔︎",
    "6": "🀕︎",
    "7": "🀖︎",
    "8": "🀗︎",
    "9": "🀘︎"
  };
  const pinzu: Record<string, string> = {
    "1": "🀙︎",
    "2": "🀚︎",
    "3": "🀛︎",
    "4": "🀜︎",
    "5": "🀝︎",
    "6": "🀞︎",
    "7": "🀟︎",
    "8": "🀠︎",
    "9": "🀡︎"
  };

  if (tile.endsWith("m")) {
    return { main: manzu[tile[0]] ?? tile[0], color: "bg-gradient-to-b from-red-950 via-red-800 to-red-600 bg-clip-text text-transparent" };
  }
  if (tile.endsWith("p")) {
    return { main: pinzu[tile[0]] ?? tile[0], color: "bg-gradient-to-b from-slate-950 via-blue-950 to-blue-800 bg-clip-text text-transparent" };
  }
  if (tile.endsWith("s")) {
    return { main: souzu[tile[0]] ?? tile[0], color: "bg-gradient-to-b from-emerald-950 via-teal-800 to-emerald-600 bg-clip-text text-transparent" };
  }

  const honors: Record<string, { main: string; color: string }> = {
    E: { main: "🀀︎", color: "text-black" },
    S: { main: "🀁︎", color: "text-black" },
    W: { main: "🀂︎", color: "text-black" },
    N: { main: "🀃︎", color: "text-black" },
    P: { main: "🀆︎", color: "text-white [-webkit-text-stroke:1.4px_#111827]" },
    F: { main: "🀅︎", color: "text-emerald-900" },
    C: { main: "🀄︎", color: "text-red-700" }
  };

  return honors[tile] ?? { main: tile, color: "text-black" };
}
