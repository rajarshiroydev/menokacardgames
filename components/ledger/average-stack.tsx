import { averageStack } from "@/lib/poker/ledger";

/**
 * "Average stack ₹12,500 · 4 at the table" under the Table tiles, in the app and
 * on the live link (plan entry "average stack (plan)"). Nothing with nobody
 * seated.
 */
export function AverageStackLine({
  onTable,
  seated,
  money,
}: {
  onTable: number;
  seated: number;
  money: (value: number) => string;
}) {
  const average = averageStack(onTable, seated);
  if (average === null) return null;
  return (
    <p className="ledger-average">
      Average stack <b>{money(average)}</b> · {seated} at the table
    </p>
  );
}
