/**
 * TOP 10 / TOP 20. Text markers with a rule either side, not pills: the board
 * has no card chrome anywhere and a group label is not the exception.
 */
export function RankDivider({ label }: { label: string }) {
  return (
    <li className="marker" role="presentation">
      <span>{label}</span>
    </li>
  );
}
