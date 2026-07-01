import { Tile, tileLabel } from "@/lib/mahjong";
import clsx from "clsx";

type Props = {
  tile: Tile;
  selected?: boolean;
  disabled?: boolean;
  size?: "md" | "sm" | "river" | "info";
  disabledTone?: "default" | "guessed";
  onClick?: () => void;
};

export function TileButton({ tile, selected = false, disabled = false, size = "md", disabledTone = "default", onClick }: Props) {
  const face = getTileFace(tile);
  const isInteractive = Boolean(onClick) && !disabled;
  const isGuessedDisabled = disabled && disabledTone === "guessed";
  const sizes = {
    md: {
      tile: "h-[72px] w-[50px] sm:h-20 sm:w-14",
      artwork: "h-[62px] w-[44px] sm:h-[68px] sm:w-[48px]",
      glyph: "text-[58px] sm:text-[66px]"
    },
    sm: {
      tile: "h-[62px] w-[43px] sm:h-[68px] sm:w-[48px]",
      artwork: "h-[54px] w-[38px] sm:h-[58px] sm:w-[42px]",
      glyph: "text-[50px] sm:text-[56px]"
    },
    river: {
      tile: "h-[58px] w-[40px] sm:h-[62px] sm:w-[43px]",
      artwork: "h-[50px] w-[35px] sm:h-[54px] sm:w-[38px]",
      glyph: "text-[46px] sm:text-[50px]"
    },
    info: {
      tile: "h-[48px] w-[34px] sm:h-[52px] sm:w-[37px]",
      artwork: "h-[42px] w-[30px] sm:h-[46px] sm:w-[33px]",
      glyph: "text-[38px] sm:text-[42px]"
    }
  }[size];

  return (
    <button
      type="button"
      aria-label={tileLabel(tile)}
      title={tileLabel(tile)}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white shadow-[0_5px_0_rgba(120,113,108,0.35),0_10px_18px_rgba(23,33,28,0.14)] transition",
        sizes.tile,
        isGuessedDisabled
          ? "border-stone-400 bg-stone-100 opacity-55 shadow-[0_3px_0_rgba(120,113,108,0.18),0_6px_12px_rgba(23,33,28,0.08)] ring-1 ring-stone-300"
          : selected
          ? "border-ember ring-4 ring-ember/35 -translate-y-1"
          : "border-stone-300 ring-1 ring-white/80",
        isInteractive && "hover:-translate-y-1 hover:border-felt hover:shadow-[0_7px_0_rgba(22,101,52,0.34),0_14px_22px_rgba(23,33,28,0.18)]",
        disabled && "cursor-not-allowed",
        disabled && onClick && !isGuessedDisabled && "opacity-65"
      )}
    >
      <span className="absolute inset-0 grid place-items-center">
        <span className={clsx("grid place-items-center overflow-visible", sizes.artwork, isGuessedDisabled && "grayscale opacity-60 contrast-75")}>
          <span className={clsx("block text-center leading-none", sizes.glyph, face.offset, face.color)}>{face.main}</span>
        </span>
      </span>
      {selected && <span className="absolute -right-1 -top-1 rounded-full bg-ember px-1.5 py-0.5 text-[10px] font-black text-white">✓</span>}
    </button>
  );
}

export function TileBack() {
  return (
    <div className="relative flex h-[72px] w-[50px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-emerald-950 bg-white shadow-[0_5px_0_rgba(20,83,45,0.45),0_10px_18px_rgba(23,33,28,0.16)] sm:h-20 sm:w-14">
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-[62px] w-[44px] place-items-center overflow-visible sm:h-[68px] sm:w-[48px]">
          <span className="block -translate-y-px text-center text-[58px] leading-none sm:text-[66px]">🀫</span>
        </span>
      </span>
    </div>
  );
}

function getTileFace(tile: Tile): { main: string; color: string; offset: string } {
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
    return { main: manzu[tile[0]] ?? tile[0], color: "text-red-800", offset: "-translate-x-[1px] -translate-y-[7px]" };
  }
  if (tile.endsWith("p")) {
    return { main: pinzu[tile[0]] ?? tile[0], color: "text-blue-950", offset: "-translate-x-[1px] -translate-y-[7px]" };
  }
  if (tile.endsWith("s")) {
    return { main: souzu[tile[0]] ?? tile[0], color: "text-teal-700", offset: "-translate-x-[1px] -translate-y-[7px]" };
  }

  const honors: Record<string, { main: string; color: string; offset: string }> = {
    E: { main: "🀀︎", color: "text-black", offset: "-translate-x-[1px] -translate-y-[7px]" },
    S: { main: "🀁︎", color: "text-black", offset: "-translate-x-[1px] -translate-y-[7px]" },
    W: { main: "🀂︎", color: "text-black", offset: "-translate-x-[1px] -translate-y-[7px]" },
    N: { main: "🀃︎", color: "text-black", offset: "-translate-x-[1px] -translate-y-[7px]" },
    P: { main: "🀆︎", color: "text-white [-webkit-text-stroke:1.4px_#111827]", offset: "-translate-x-[1px] -translate-y-[7px]" },
    F: { main: "🀅︎", color: "text-emerald-900", offset: "-translate-x-[1px] -translate-y-[7px]" },
    C: { main: "🀄︎", color: "text-red-700", offset: "-translate-x-[1px] -translate-y-[7px]" }
  };

  return honors[tile] ?? { main: tile, color: "text-black", offset: "-translate-x-[1px] -translate-y-[7px]" };
}
