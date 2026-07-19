import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { matchesBonusIncomeSchedule } from "../lib/bonusIncomeHeuristic";
import { formatYen } from "../lib/dateUtils";
import type { BonusIncomeSchedule, BonusPeriod } from "../types/models";

/** ボーナス払いの設定画面(集計対象月・振込判定スケジュール・カテゴリ別使用計画) */
export default function BonusSettingsView() {
  const bonusPeriods = useLiveQuery(() => db.bonusPeriods.orderBy("displayOrder").toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const fundingSources = useLiveQuery(() => db.fundingSources.toArray(), []);
  const bonusIncomeSchedules = useLiveQuery(() => db.bonusIncomeSchedules.toArray(), []);
  const majorCategories = useLiveQuery(
    () => db.majorCategories.orderBy("displayOrder").toArray(),
    []
  );
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);
  const bonusCategoryPlans = useLiveQuery(() => db.bonusCategoryPlans.toArray(), []);

  const [periodEdits, setPeriodEdits] = useState<Record<string, { startMonth: string; endMonth: string }>>(
    {}
  );
  const [periodAppliedId, setPeriodAppliedId] = useState<string | null>(null);
  const [scheduleFundingSourceID, setScheduleFundingSourceID] = useState("");
  const [scheduleMonth, setScheduleMonth] = useState("7");
  const [scheduleDay, setScheduleDay] = useState("10");
  const [scheduleAppliedCount, setScheduleAppliedCount] = useState<number | null>(null);

  const [planPeriodID, setPlanPeriodID] = useState("");
  const [planYear, setPlanYear] = useState(String(new Date().getFullYear()));
  const [planMajorCategoryID, setPlanMajorCategoryID] = useState("");
  const [planSubcategoryID, setPlanSubcategoryID] = useState("");
  const [planAmount, setPlanAmount] = useState("");
  const [planMessage, setPlanMessage] = useState<string | null>(null);

  if (
    !bonusPeriods ||
    !transactions ||
    !fundingSources ||
    !bonusIncomeSchedules ||
    !majorCategories ||
    !subcategories ||
    !bonusCategoryPlans
  ) {
    return <p className="muted">読み込み中...</p>;
  }

  async function updatePeriodRange(period: BonusPeriod) {
    const edit = periodEdits[period.id];
    if (!edit) return;
    const startMonth = Number(edit.startMonth);
    const endMonth = Number(edit.endMonth);
    if (!Number.isInteger(startMonth) || !Number.isInteger(endMonth)) return;
    if (startMonth < 1 || startMonth > 12 || endMonth < 1 || endMonth > 12) return;
    if (startMonth > endMonth) return;
    await db.bonusPeriods.update(period.id, { startMonth, endMonth });
    setPeriodAppliedId(period.id);
    setTimeout(() => setPeriodAppliedId(null), 2000);
  }

  async function addSchedule() {
    const month = Number(scheduleMonth);
    const day = Number(scheduleDay);
    if (!scheduleFundingSourceID) return;
    if (!Number.isInteger(month) || month < 1 || month > 12) return;
    if (!Number.isInteger(day) || day < 1 || day > 31) return;

    const id = crypto.randomUUID();
    const schedule: BonusIncomeSchedule = {
      id,
      fundingSourceID: scheduleFundingSourceID,
      month,
      day,
    };
    await db.bonusIncomeSchedules.add(schedule);

    const matching = transactions!.filter(
      (t) =>
        t.type === "income" &&
        !t.isBonusIncome &&
        matchesBonusIncomeSchedule(t.date, scheduleFundingSourceID, [schedule])
    );
    await Promise.all(matching.map((t) => db.transactions.update(t.id, { isBonusIncome: true })));

    setScheduleFundingSourceID("");
    setScheduleAppliedCount(matching.length);
    setTimeout(() => setScheduleAppliedCount(null), 3000);
  }

  async function deleteSchedule(id: string) {
    if (!confirm("このボーナス振込設定を削除しますか?")) return;
    await db.bonusIncomeSchedules.delete(id);
  }

  async function addOrUpdatePlan() {
    const year = Number(planYear);
    const amount = Number(planAmount);
    if (!planPeriodID || !planMajorCategoryID) return;
    if (!Number.isInteger(year)) return;
    if (!planAmount || !Number.isFinite(amount)) return;
    const subcategoryID = planSubcategoryID || null;

    const existing = bonusCategoryPlans!.find(
      (p) =>
        p.bonusPeriodID === planPeriodID &&
        p.year === year &&
        p.majorCategoryID === planMajorCategoryID &&
        (p.subcategoryID ?? null) === subcategoryID
    );
    if (existing) {
      await db.bonusCategoryPlans.update(existing.id, { plannedAmount: amount });
    } else {
      await db.bonusCategoryPlans.add({
        id: crypto.randomUUID(),
        bonusPeriodID: planPeriodID,
        year,
        majorCategoryID: planMajorCategoryID,
        subcategoryID,
        plannedAmount: amount,
      });
    }
    setPlanAmount("");
    setPlanMessage("計画を反映しました");
    setTimeout(() => setPlanMessage(null), 2000);
  }

  async function deletePlan(id: string) {
    if (!confirm("この使用計画を削除しますか?")) return;
    await db.bonusCategoryPlans.delete(id);
  }

  return (
    <div>
      <Link to="/settings" className="back-link">
        ‹ 設定へ戻る
      </Link>
      <h1 className="screen-title">ボーナス設定</h1>

      <div className="section">
        <div className="section-title">ボーナス振込設定</div>
        <p className="muted">
          振込先口座と振込予定日(毎年同じ月日)を設定すると、取り込み時にボーナス収入を自動判定します。
          銀行の非営業日(土日等)で振込が前倒しになる場合を考慮し、設定日からさかのぼって数日以内の入金も対象にします(祝日までは判定していません)。
        </p>

        {bonusIncomeSchedules.length > 0 && (
          <div className="list" style={{ marginBottom: 12 }}>
            {bonusIncomeSchedules.map((schedule) => {
              const source = fundingSources.find((s) => s.id === schedule.fundingSourceID);
              return (
                <div key={schedule.id} className="list-row">
                  <div>
                    <div>{source?.displayName ?? "不明な取り込み元"}</div>
                    <div className="muted">
                      {schedule.month}月{schedule.day}日ごろ
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => deleteSchedule(schedule.id)}
                  >
                    削除
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="form-row">
          <label>振込先口座</label>
          <select
            value={scheduleFundingSourceID}
            onChange={(e) => setScheduleFundingSourceID(e.target.value)}
          >
            <option value="">選択してください</option>
            {fundingSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.displayName}
              </option>
            ))}
          </select>
        </div>
        <div className="button-row">
          <input
            type="number"
            min={1}
            max={12}
            value={scheduleMonth}
            onChange={(e) => setScheduleMonth(e.target.value)}
            placeholder="月"
          />
          <input
            type="number"
            min={1}
            max={31}
            value={scheduleDay}
            onChange={(e) => setScheduleDay(e.target.value)}
            placeholder="日"
          />
          <button type="button" className="btn-primary" onClick={addSchedule}>
            追加
          </button>
        </div>
        {scheduleAppliedCount !== null && (
          <p className="muted">既存の取引 {scheduleAppliedCount}件にも反映しました</p>
        )}
      </div>

      <div className="section">
        <div className="section-title">集計対象月</div>
        <div className="list">
          {bonusPeriods.map((period) => {
            const edit = periodEdits[period.id] ?? {
              startMonth: String(period.startMonth),
              endMonth: String(period.endMonth),
            };
            return (
              <div key={period.id} className="card">
                <strong>{period.label}</strong>
                <div className="form-row">
                  <label>集計対象月(開始月〜終了月)</label>
                  <div className="button-row">
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={edit.startMonth}
                      onChange={(e) =>
                        setPeriodEdits((prev) => ({
                          ...prev,
                          [period.id]: { ...edit, startMonth: e.target.value },
                        }))
                      }
                    />
                    <span>〜</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={edit.endMonth}
                      onChange={(e) =>
                        setPeriodEdits((prev) => ({
                          ...prev,
                          [period.id]: { ...edit, endMonth: e.target.value },
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => updatePeriodRange(period)}
                    >
                      更新
                    </button>
                  </div>
                </div>
                {periodAppliedId === period.id && <p className="muted">更新しました</p>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <div className="section-title">カテゴリ別使用計画</div>
        <p className="muted">
          ボーナスの使用用途を計画します。小カテゴリを指定しなければ大カテゴリ全体への計画になります。
        </p>

        <div className="form-row">
          <label>期間</label>
          <select value={planPeriodID} onChange={(e) => setPlanPeriodID(e.target.value)}>
            <option value="">選択してください</option>
            {bonusPeriods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>年</label>
          <input
            type="number"
            value={planYear}
            onChange={(e) => setPlanYear(e.target.value)}
            placeholder="年"
          />
        </div>
        <div className="form-row">
          <label>大カテゴリ</label>
          <select
            value={planMajorCategoryID}
            onChange={(e) => {
              setPlanMajorCategoryID(e.target.value);
              setPlanSubcategoryID("");
            }}
          >
            <option value="">選択してください</option>
            {majorCategories.map((major) => (
              <option key={major.id} value={major.id}>
                {major.name}
              </option>
            ))}
          </select>
        </div>
        {planMajorCategoryID && (
          <div className="form-row">
            <label>小カテゴリ</label>
            <select value={planSubcategoryID} onChange={(e) => setPlanSubcategoryID(e.target.value)}>
              <option value="">指定なし(大カテゴリ全体)</option>
              {subcategories
                .filter((s) => s.majorCategoryID === planMajorCategoryID)
                .map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
            </select>
          </div>
        )}
        <div className="button-row">
          <input
            type="number"
            value={planAmount}
            onChange={(e) => setPlanAmount(e.target.value)}
            placeholder="計画額"
          />
          <button type="button" className="btn-primary" onClick={addOrUpdatePlan}>
            反映
          </button>
        </div>
        {planMessage && <p className="muted">{planMessage}</p>}

        {bonusCategoryPlans.length > 0 && (
          <div className="list" style={{ marginTop: 12 }}>
            {[...bonusCategoryPlans]
              .sort((a, b) => b.year - a.year)
              .map((plan) => {
                const period = bonusPeriods.find((p) => p.id === plan.bonusPeriodID);
                const major = majorCategories.find((m) => m.id === plan.majorCategoryID);
                const sub = plan.subcategoryID
                  ? subcategories.find((s) => s.id === plan.subcategoryID)
                  : undefined;
                const label = sub ? `${major?.name ?? "不明"} / ${sub.name}` : major?.name ?? "不明";
                return (
                  <div key={plan.id} className="list-row">
                    <div>
                      <div>
                        {label}({period?.label ?? "不明な期間"} {plan.year}年)
                      </div>
                      <div className="muted">{formatYen(plan.plannedAmount)}</div>
                    </div>
                    <button type="button" className="btn-secondary" onClick={() => deletePlan(plan.id)}>
                      削除
                    </button>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
