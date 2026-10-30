/**
 * The icon vocabulary.
 *
 * One family (`lucide-react`) behind one wrapper (plan §7.8). Screens ask for a
 * *semantic* name — `<Icon name="library" />` — and never import the icon set
 * directly, which is what stops a second family arriving one import at a time
 * and a "tracks" glyph meaning something different on two screens.
 *
 * The `size` prop is the optical ramp from the mobile tokens, so an icon is
 * never sized by an inline pixel value.
 */

import {
  BookOpen,
  ChartLine,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  Disc3,
  Download,
  Ellipsis,
  ExternalLink,
  Globe,
  History,
  House,
  Library,
  ListMusic,
  LogOut,
  Moon,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Settings,
  SkipBack,
  SkipForward,
  Sparkles,
  Sun,
  Trash2,
  TriangleAlert,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";

const ICONS = {
  home: House,
  library: Library,
  history: History,
  playlist: ListMusic,
  browse: Globe,
  player: Disc3,
  settings: Settings,
  book: BookOpen,
  stats: ChartLine,
  search: Search,
  /** A note left at a point in a track — an annotation, not an edit affordance. */
  note: Pencil,
  play: Play,
  pause: Pause,
  previous: SkipBack,
  next: SkipForward,
  /**
   * Reading-direction arrows, named by *direction in the text*, not by the
   * shape. In RTL "start" is the right-hand side, so `start` is a right chevron —
   * a component that asks for `start` gets the correct arrow without knowing
   * which way the document runs.
   */
  start: ChevronRight,
  end: ChevronLeft,
  plus: Plus,
  close: X,
  more: Ellipsis,
  external: ExternalLink,
  download: Download,
  clock: Clock,
  logout: LogOut,
  light: Sun,
  dark: Moon,
  error: CircleAlert,
  warning: TriangleAlert,
  success: CircleCheck,
  offline: WifiOff,
  delete: Trash2,
  empty: Sparkles,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** The optical ramp, from `mobile/src/theme/tokens.ts` (`iconSize`). */
const SIZES = { xs: 13, sm: 15, md: 18, lg: 22, xl: 26, hero: 44 } as const;

export type IconSize = keyof typeof SIZES;

type IconProps = {
  name: IconName;
  size?: IconSize;
  className?: string;
  /** Icons are decoration next to a label; a lone icon needs one. */
  label?: string;
};

export function Icon({ name, size = "md", className, label }: IconProps) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      width={SIZES[size]}
      height={SIZES[size]}
      strokeWidth={1.75}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
