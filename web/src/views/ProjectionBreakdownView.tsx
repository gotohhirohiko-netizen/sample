import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { formatMonthDay, formatYearMonth, formatYen, parseMonthParam } from "../lib/dateUtils";
import { loadLastImportConfirmedAt } from "../lib/keyStorage";
import { monthEndExpenseProjection } from "../lib/projectionCalculator";

/** 定常費用の予想・月末着地予想の内訳画面。ホーム画面の凡例から遷移する */
export default function ProjectionBreakdownView() {
  const { month: monthParam } = useParams<{ month: string }>();
  const month = parseMonthParam(monthParam);
  const [showProportionalList, setShowProportionalList] = useState(false);
  const [importConfirmedAt, setImportConfirmedAt] = useState<Date | null>(null);

  useEffect(() => {
    loadLastImportConfirmedAt().then(setImportConfirmedAt);
  }, []);

  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const recurringOverrides = useLiveQuery(() => db.recurringOverrides.toArray(), []);
  const specificMonthPlans = useLiveQuery(() => db.specificMonthPlans.toArray(), []);

  if (!transactions || !recurringOverrides || !specificMonthPlans) {
    return <p className="muted">読み込み中...</p>;
  }

  const projection = monthEndExpenseProjection(
    month,
    transactions,
    recurringOverrides,
    specificMonthPlans,
    importConfirmedAt
  );

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
          <span className="projection-posted">実績計上済み</span>は黒字、
          <span className="projection-pending">未計上(先月実績を予想として採用)</span>
          はオレンジ字で表示しています。
        </p>
        {projection.recurringBreakdown.length > 0 ? (
          <div className="list" style={{ marginTop: 8 }}>
            {projection.recurringBreakdown.map((r) => (
              <div key={r.merchant} className="list-row">
                <span className={r.posted ? "projection-posted" : "projection-pending"}>
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
          <span className="projection-posted">実績計上済み</span>は黒字、
          <span className="projection-pending">計画額</span>はオレンジ字で表示しています。
        </p>
        {projection.specificBreakdown.length > 0 ? (
          <div className="list" style={{ marginTop: 8 }}>
            {projection.specificBreakdown.map((s) => (
              <div key={s.merchant} className="list-row">
                <span className={s.posted ? "projection-posted" : "projection-pending"}>
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
          突発扱いの支出(食費等)は、前回取り込み日の前日分までの実績を日割りで月末まで延伸した金額です
          (直近の取り込み当日分はまだ取り込みが完了していない可能性があるため、実績・日割り計算のいずれからも除きます)。
        </p>
        <div className="list" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="list-row"
            onClick={() => setShowProportionalList((v) => !v)}
          >
            <span>実績・前日分まで({formatYen(projection.proportionalActual)})</span>
            <span className="muted">{showProportionalList ? "▴" : "▾"}</span>
          </button>
          <div className="list-row">
            <span>月末までの延伸予想</span>
            <span className="muted">{formatYen(projection.proportionalProjected)}</span>
          </div>
        </div>
        {showProportionalList && (
          <div className="list" style={{ marginTop: 8 }}>
            {projection.proportionalTransactions.length > 0 ? (
              projection.proportionalTransactions.map((t) => (
                <Link key={t.id} to={`/transactions/${t.id}`} className="list-row">
                  <span>
                    {formatMonthDay(new Date(t.date))} {t.merchant}
                  </span>
                  <span className="muted">{formatYen(t.amount)}</span>
                </Link>
              ))
            ) : (
              <p className="muted">該当する取引はありません</p>
            )}
          </div>
        )}
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
