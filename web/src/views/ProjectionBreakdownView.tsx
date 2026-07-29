import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { formatYearMonth, formatYen, parseMonthParam } from "../lib/dateUtils";
import { monthEndExpenseProjection } from "../lib/projectionCalculator";

/** 定常費用の予想・月末着地予想の内訳画面。ホーム画面の凡例から遷移する */
export default function ProjectionBreakdownView() {
  const { month: monthParam } = useParams<{ month: string }>();
  const month = parseMonthParam(monthParam);

  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const recurringOverrides = useLiveQuery(() => db.recurringOverrides.toArray(), []);
  const specificMonthPlans = useLiveQuery(() => db.specificMonthPlans.toArray(), []);

  if (!transactions || !recurringOverrides || !specificMonthPlans) {
    return <p className="muted">読み込み中...</p>;
  }

  const projection = monthEndExpenseProjection(month, transactions, recurringOverrides, specificMonthPlans);

  if (!projection) {
    return (
      <div>
        <Link to="/" className="back-link">
          ‹ ホームへ戻る
        </Link>
        <p className="muted">今月以外は内訳を表示できません。</p>
      </div>
    );
  }

  return (
    <div>
      <Link to="/" className="back-link">
        ‹ ホームへ戻る
      </Link>
      <h1 className="screen-title">{formatYearMonth(month)}の予想内訳</h1>

      <div className="section card">
        <div className="section-title">
          <span className="legend-recurring">■</span>
          毎月定常({formatYen(projection.recurringProjected)})
        </div>
        <p className="muted">
          今月すでに実績があればその金額、まだ実績が無ければ先月の実績を予想として採用します。
        </p>
        {projection.recurringBreakdown.length > 0 ? (
          <div className="list" style={{ marginTop: 8 }}>
            {projection.recurringBreakdown.map((r) => (
              <div key={r.merchant} className="list-row">
                <span>
                  {r.merchant}
                  {!r.posted && <span className="muted">(未計上)</span>}
                </span>
                <span className="muted">{formatYen(r.projected)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">毎月定常の店名はありません</p>
        )}
      </div>

      <div className="section card">
        <div className="section-title">該当月定常({formatYen(projection.specificProjected)})</div>
        <p className="muted">
          今月すでに実績があればその金額、まだ実績が無ければ計画額(当月の計画・予算調整で登録)を採用します。
        </p>
        {projection.specificBreakdown.length > 0 ? (
          <div className="list" style={{ marginTop: 8 }}>
            {projection.specificBreakdown.map((s) => (
              <div key={s.merchant} className="list-row">
                <span>
                  {s.merchant}
                  {!s.posted && <span className="muted">(計画)</span>}
                </span>
                <span className="muted">{formatYen(s.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">該当月定常の計画・実績はありません</p>
        )}
      </div>

      <div className="section card">
        <div className="section-title">
          <span className="legend-proportional">■</span>
          比例費用(月末まで延伸: {formatYen(projection.proportionalProjected)})
        </div>
        <p className="muted">
          突発扱いの支出(食費等)は、今月ここまでの実績を日割りで月末まで延伸した金額です。
        </p>
        <div className="list" style={{ marginTop: 8 }}>
          <div className="list-row">
            <span>今月ここまでの実績</span>
            <span className="muted">{formatYen(projection.proportionalActual)}</span>
          </div>
          <div className="list-row">
            <span>月末までの延伸予想</span>
            <span className="muted">{formatYen(projection.proportionalProjected)}</span>
          </div>
        </div>
      </div>

      <div className="section card">
        <div className="section-title">月末着地予想 合計</div>
        <div className="list" style={{ marginTop: 8 }}>
          <div className="list-row">
            <span>毎月定常</span>
            <span className="muted">{formatYen(projection.recurringProjected)}</span>
          </div>
          <div className="list-row">
            <span>該当月定常</span>
            <span className="muted">{formatYen(projection.specificProjected)}</span>
          </div>
          <div className="list-row">
            <span>比例費用</span>
            <span className="muted">{formatYen(projection.proportionalProjected)}</span>
          </div>
          <div className="list-row">
            <span>合計</span>
            <span>{formatYen(projection.totalProjected)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
