import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { merchantMatchKey } from "../lib/categoryResolver";
import { formatMonthDay, formatYearMonth, formatYen, isSameMonth, parseMonthParam } from "../lib/dateUtils";
import { loadLastImportConfirmedAt } from "../lib/keyStorage";
import { monthEndExpenseProjection } from "../lib/projectionCalculator";
import type { Transaction } from "../types/models";

/** 定常費用の予想・月末着地予想の内訳画面。ホーム画面の凡例から遷移する */
export default function ProjectionBreakdownView() {
  const { month: monthParam } = useParams<{ month: string }>();
  const month = parseMonthParam(monthParam);
  const [showProportionalList, setShowProportionalList] = useState(false);
  const [importConfirmedAt, setImportConfirmedAt] = useState<Date | null>(null);
  const [linkingKey, setLinkingKey] = useState<string | null>(null);

  useEffect(() => {
    loadLastImportConfirmedAt().then(setImportConfirmedAt);
  }, []);

  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const recurringOverrides = useLiveQuery(() => db.recurringOverrides.toArray(), []);
  const specificMonthPlans = useLiveQuery(() => db.specificMonthPlans.toArray(), []);
  const merchantAliases = useLiveQuery(() => db.merchantAliases.toArray(), []);

  if (!transactions || !recurringOverrides || !specificMonthPlans || !merchantAliases) {
    return <p className="muted">読み込み中...</p>;
  }

  const projection = monthEndExpenseProjection(
    month,
    transactions,
    recurringOverrides,
    specificMonthPlans,
    importConfirmedAt,
    merchantAliases
  );

  const monthExpenseTransactions = transactions.filter(
    (t) => t.type === "expense" && isSameMonth(new Date(t.date), month)
  );

  function displayNameForMerchantKey(key: string): string {
    const match = transactions!
      .filter((t) => merchantMatchKey(t.merchant) === key)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    return match?.merchant ?? key;
  }

  function aliasesFor(canonicalKey: string) {
    return merchantAliases!
      .filter((a) => a.canonicalKey === canonicalKey)
      .map((a) => ({ id: a.id, label: displayNameForMerchantKey(a.aliasKey) }));
  }

  async function linkAlias(canonicalKey: string, transaction: Transaction) {
    const aliasKey = merchantMatchKey(transaction.merchant);
    if (aliasKey === canonicalKey) {
      setLinkingKey(null);
      return;
    }
    const existing = merchantAliases!.find((a) => a.aliasKey === aliasKey);
    if (existing) {
      await db.merchantAliases.update(existing.id, {
        canonicalKey,
        updatedAt: new Date().toISOString(),
      });
    } else {
      await db.merchantAliases.add({
        id: crypto.randomUUID(),
        aliasKey,
        canonicalKey,
        updatedAt: new Date().toISOString(),
      });
    }
    setLinkingKey(null);
  }

  async function unlinkAlias(aliasId: string) {
    await db.merchantAliases.delete(aliasId);
  }

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
          発生日は、実績があればその日付、無ければ先月の発生日から推定した想定日を表示し、
          日付順に並んでいます。
          <span className="projection-posted">実績計上済み</span>は黒字、
          <span className="projection-pending">未計上(先月実績を予想として採用)</span>
          はオレンジ字で表示しています。
          実績側の店名表記が一致せず未計上のままになる場合は、下で今月の取引を指定して紐付けられます
          (一度登録すれば翌月以降も同じ表記の取引が自動的に紐付きます)。
        </p>
        {projection.recurringBreakdown.length > 0 ? (
          <div className="list" style={{ marginTop: 8 }}>
            {projection.recurringBreakdown.map((r) => (
              <MerchantLinkRow
                key={r.key}
                merchantKey={r.key}
                displayName={r.merchant}
                datePrefix={r.expectedDate ? formatMonthDay(new Date(r.expectedDate)) : null}
                suffix={r.posted ? null : r.expectedDate ? "(未計上・推定日)" : "(未計上)"}
                amount={r.projected}
                posted={r.posted}
                aliases={aliasesFor(r.key)}
                candidates={monthExpenseTransactions}
                linkingKey={linkingKey}
                onToggleLinking={setLinkingKey}
                onLink={linkAlias}
                onUnlink={unlinkAlias}
              />
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
          実績側の店名表記が一致せず計画額と二重計上されてしまう場合は、下で今月の取引を指定して紐付けられます
          (一度登録すれば翌月以降も同じ表記の取引が自動的に紐付きます)。
        </p>
        {projection.specificBreakdown.length > 0 ? (
          <div className="list" style={{ marginTop: 8 }}>
            {projection.specificBreakdown.map((s) => (
              <MerchantLinkRow
                key={s.key}
                merchantKey={s.key}
                displayName={s.merchant}
                datePrefix={null}
                suffix={s.posted ? null : "(計画)"}
                amount={s.amount}
                posted={s.posted}
                aliases={aliasesFor(s.key)}
                candidates={monthExpenseTransactions}
                linkingKey={linkingKey}
                onToggleLinking={setLinkingKey}
                onLink={linkAlias}
                onUnlink={unlinkAlias}
              />
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

interface MerchantLinkRowProps {
  merchantKey: string;
  displayName: string;
  datePrefix: string | null;
  suffix: string | null;
  amount: number;
  posted: boolean;
  aliases: { id: string; label: string }[];
  candidates: Transaction[];
  linkingKey: string | null;
  onToggleLinking: (key: string | null) => void;
  onLink: (canonicalKey: string, transaction: Transaction) => void;
  onUnlink: (aliasId: string) => void;
}

/**
 * 毎月定常・該当月定常の1行。表記揺れの別名登録(紐付け/解除)のUIを持つ。
 * 別名が登録済みの行は、実績計上済みになった後も解除できるようカード表示のままにする。
 */
function MerchantLinkRow({
  merchantKey,
  displayName,
  datePrefix,
  suffix,
  amount,
  posted,
  aliases,
  candidates,
  linkingKey,
  onToggleLinking,
  onLink,
  onUnlink,
}: MerchantLinkRowProps) {
  const linkingOpen = linkingKey === merchantKey;
  const sortedCandidates = [...candidates].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  if (posted && aliases.length === 0) {
    return (
      <div className="list-row">
        <span className="projection-posted">
          {datePrefix && `${datePrefix} `}
          {displayName}
        </span>
        <span className="muted">{formatYen(amount)}</span>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span className={posted ? "projection-posted" : "projection-pending"}>
          {datePrefix && `${datePrefix} `}
          {displayName} {suffix && <span className="muted">{suffix}</span>}
        </span>
        <span className="muted">{formatYen(amount)}</span>
      </div>

      {aliases.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {aliases.map((a) => (
            <p key={a.id} className="muted">
              表記揺れとして紐付け済み: {a.label}
              <button
                type="button"
                className="btn-secondary"
                style={{ marginLeft: 8 }}
                onClick={() => onUnlink(a.id)}
              >
                解除
              </button>
            </p>
          ))}
        </div>
      )}

      {!posted && (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onToggleLinking(linkingOpen ? null : merchantKey)}
          >
            {linkingOpen ? "閉じる" : "実績の取引と紐付ける"}
          </button>
          {linkingOpen && (
            <div className="list" style={{ marginTop: 8 }}>
              {sortedCandidates.length > 0 ? (
                sortedCandidates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="list-row"
                    onClick={() => onLink(merchantKey, t)}
                  >
                    <span>
                      {formatMonthDay(new Date(t.date))} {t.merchant}
                    </span>
                    <span className="muted">{formatYen(t.amount)}</span>
                  </button>
                ))
              ) : (
                <p className="muted">今月の取引がありません</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
