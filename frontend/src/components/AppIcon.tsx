/** The NeverDisc logo: the turquoise sparkle (the same file as the favicon). */
export function AppIcon({ size = 22 }: { size?: number }) {
  return <img className="app-icon" src="/favicon.svg" width={size} height={size} alt="" />;
}

/** The gold disc, used for the Collection tab and heading. */
export function DiscIcon({ size = 22 }: { size?: number }) {
  return <img className="app-icon" src="/disc.svg" width={size} height={size} alt="" />;
}
