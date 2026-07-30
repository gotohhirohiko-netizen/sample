import { formatYen } from "../lib/dateUtils";

export interface ProjectionMarker {
  key: string;
  value: number;
  className: string;
}

interface BudgetProgressBarProps {
  /** 実績額(バーの塗り幅) */
  actual: number;
  /** 予算・収入等の基準額(バー下に▲で示す) */
  threshold: number;
  /** 今日時点で消化しているべき目安額(バー内に縦線で示す。月次予実の日割りペース等) */
  paceValue?: number;
  /** バーの上に▼で示す追加の目安額(定常費用の予想・月末着地予想等) */
  markers?: ProjectionMarker[];
}

const TICK_STEPS = [
  1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000, 2000000, 5000000,
  10000000,
];
const TARGET_TICK_COUNT = 5;

function pickTickStep(axisMax: number): number {
  for (const step of TICK_STEPS) {
    if (axisMax / step <= TARGET_TICK_COUNT) return step;
  }
  return TICK_STEPS[TICK_STEPS.length - 1];
}

function formatTickLabel(amount: number): string {
  if (amount >= 10000 && amount % 10000 === 0) {
    return `${amount / 10000}万`;
  }
  return formatYen(amount);
}

/**
 * 予算(または収入)実績のグラフ表示。予算規模に応じて目盛り(10万円区切り・
 * 5万円区切り等)を自動選択し、基準額(予算・収入)をバー下に▲で示す。
 * 実績が基準額を超えても、目盛りの最大値まではみ出さずに表示できる
 * (従来はバー幅=対予算比率%だったため100%超過分が表現できなかった)。
 */
export default function BudgetProgressBar({
  actual,
  threshold,
  paceValue,
  markers = [],
}: BudgetProgressBarProps) {
  const candidateMax = Math.max(actual, threshold, ...markers.map((m) => m.value), 1);
  const tickStep = pickTickStep(candidateMax);
  const axisMax = Math.ceil(candidateMax / tickStep) * tickStep;
  const ticks: number[] = [];
  for (let v = tickStep; v <= axisMax; v += tickStep) {
    ticks.push(v);
  }

  const over = threshold > 0 && actual > threshold;
  const actualWidth = Math.min((actual / axisMax) * 100, 100);
  const thresholdLeft = Math.min((threshold / axisMax) * 100, 100);

  return (
    <div className="budget-progress">
      {markers.length > 0 && (
        <div className="budget-progress-markers-above">
          {markers.map((m) => (
            <span
              key={m.key}
              className={m.className}
              style={{ left: `${Math.min((m.value / axisMax) * 100, 100)}%` }}
            >
              ▼
            </span>
          ))}
        </div>
      )}
      <div className={`progress ${over ? "over" : ""}`}>
        <div className="progress-ticks">
          {ticks.map((t) => (
            <span key={t} className="progress-tick" style={{ left: `${(t / axisMax) * 100}%` }} />
          ))}
        </div>
        <div className="progress-fill" style={{ width: `${actualWidth}%` }} />
        {paceValue !== undefined && (
          <div
            className="progress-pace-marker"
            style={{ left: `${Math.min((paceValue / axisMax) * 100, 100)}%` }}
          />
        )}
      </div>
      <div className="budget-progress-axis">
        <span className="budget-progress-threshold-marker" style={{ left: `${thresholdLeft}%` }}>
          ▲
        </span>
        {ticks.map((t) => (
          <span
            key={t}
            className="budget-progress-tick-label"
            style={{ left: `${(t / axisMax) * 100}%` }}
          >
            {formatTickLabel(t)}
          </span>
        ))}
      </div>
    </div>
  );
}
