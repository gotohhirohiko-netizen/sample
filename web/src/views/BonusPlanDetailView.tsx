import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { matchesBonusIncomeSchedule } from "../lib/bonusIncomeHeuristic";
import { formatYen } from "../lib/dateUtils";
import type { BonusCategoryPlan, BonusIncomeSchedule } from "../types/models";

/**
 * ボーナス計画詳細画面。1つの計画(集計対象月の期間)について、
 * 振込先口座の設定・集計対象月の設定・使用用途の登録と予実を1画面にまとめる。
 */
export default function BonusPlanDetailView() {
  const { periodId } = useParams<{ periodId: string }>();
  const navigate = useNavigate();

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

  const [year, setYear] = useState(new Date().getFullYear());

  const [labelEdit, setLabelEdit] = useState<string | null>(null);
  const [startMonthEdit, setStartMonthEdit] = useState("");
  const [endMonthEdit, setEndMonthEdit] = useState("");
  const [periodMessage, setPeriodMessage] = useState<string | null>(null);

  const [scheduleFundingSourceID, setScheduleFundingSourceID] = useState("");
  const [scheduleMonth, setScheduleMonth] = useState("");
  const [scheduleDay, setScheduleDay] = useState("10");
  const [scheduleAppliedCount, setScheduleAppliedCount] = useState<number | null>(null);

  const [planMajorCategoryID, setPlanMajorCategoryID] = useState("");
  const [planSubcategoryID, setPlanSubcategoryID] = useState("");
  const [planAmount, setPlanAmount] = useState("");
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
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

  const period = bonusPeriods.find((p) => p.id === periodId);
  if (!period) {
    return (
      <div>
        <p className="muted">ボーナス計画が見つかりません。</p>
        <Link to="/bonus">‹ ボーナス計画へ戻る</Link>
      </div>
    );
  }

  const startMonth = startMonthEdit === "" ? String(period.startMonth) : startMonthEdit;
  const endMonth = endMonthEdit === "" ? String(period.endMonth) : endMonthEdit;
  const label = labelEdit ?? period.label;
  const scheduleMonthValue = scheduleMonth === "" ? String(period.startMonth) : scheduleMonth;

  const schedulesInRange = bonusIncomeSchedules.filter(
    (s) => s.month >= period.startMonth && s.month <= period.endMonth
  );
  const plans = bonusCategoryPlans.filter((p) => p.bonusPeriodID === period.id && p.year === year);
  const totalPlannedAmount = plans.reduce((sum, p) => sum + p.plannedAmount, 0);

  async function deletePlanPeriod() {
    if (!confirm(`「${period!.label}」を削除しますか?この計画の使用計画も全て削除されます。`)) return;
    const relatedPlans = bonusCategoryPlans!.filter((p) => p.bonusPeriodID === period!.id);
    await db.transaction("rw", db.bonusPeriods, db.bonusCategoryPlans, async () => {
      await Promise.all(relatedPlans.map((p) => db.bonusCategoryPlans.delete(p.id)));
      await db.bonusPeriods.delete(period!.id);
    });
    navigate("/bonus");
  }

  async function updatePeriod() {
    const startMonthNum = Number(startMonth);
    const endMonthNum = Number(endMonth);
    if (label.trim() === "") return;
    if (!Number.isInteger(startMonthNum) || !Number.isInteger(endMonthNum)) return;
    if (startMonthNum < 1 || startMonthNum > 12 || endMonthNum < 1 || endMonthNum > 12) return;
    if (startMonthNum > endMonthNum) return;

    await db.bonusPeriods.update(period!.id, {
      label: label.trim(),
      startMonth: startMonthNum,
      endMonth: endMonthNum,
    });
    setLabelEdit(null);
    setStartMonthEdit("");
    setEndMonthEdit("");
    setPeriodMessage("更新しました");
    setTimeout(() => setPeriodMessage(null), 2000);
  }

  async function addSchedule() {
    const month = Number(scheduleMonthValue);
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
    setScheduleMonth("");
    setScheduleAppliedCount(matching.length);
    setTimeout(() => setScheduleAppliedCount(null), 3000);
  }

  async function deleteSchedule(id: string) {
    if (!confirm("この振込先口座の設定を削除しますか?")) return;
    await db.bonusIncomeSchedules.delete(id);
  }

  function startEditPlan(plan: BonusCategoryPlan) {
    setEditingPlanId(plan.id);
    setPlanMajorCategoryID(plan.majorCategoryID);
    setPlanSubcategoryID(plan.subcategoryID ?? "");
    setPlanAmount(String(plan.plannedAmount));
  }

  function resetPlanForm() {
    setEditingPlanId(null);
    setPlanMajorCategoryID("");
    setPlanSubcategoryID("");
    setPlanAmount("");
  }

  async function addOrUpdatePlan() {
    const amount = Number(planAmount);
    if (!planMajorCategoryID) return;
    if (!planAmount || !Number.isFinite(amount)) return;
    const subcategoryID = planSubcategoryID || null;

    if (editingPlanId) {
      await db.bonusCategoryPlans.update(editingPlanId, {
        majorCategoryID: planMajorCategoryID,
        subcategoryID,
        plannedAmount: amount,
      });
    } else {
      const existing = bonusCategoryPlans!.find(
        (p) =>
          p.bonusPeriodID === period!.id &&
          p.year === year &&
          p.majorCategoryID === planMajorCategoryID &&
          (p.subcategoryID ?? null) === subcategoryID
      );
      if (existing) {
        await db.bonusCategoryPlans.update(existing.id, { plannedAmount: amount });
      } else {
        await db.bonusCategoryPlans.add({
          id: crypto.randomUUID(),
          bonusPeriodID: period!.id,
          year,
          majorCategoryID: planMajorCategoryID,
          subcategoryID,
          plannedAmount: amount,
        });
      }
    }
    resetPlanForm();
    setPlanMessage("計画を反映しました");
    setTimeout(() => setPlanMessage(null), 2000);
  }

  async function deletePlan(id: string) {
    if (!confirm("この使用計画を削除しますか?")) return;
    await db.bonusCategoryPlans.delete(id);
    if (editingPlanId === id) resetPlanForm();
  }

  return (
    <div>
      <Link to="/bonus" className="back-link">
        ‹ ボーナス計画へ戻る
      </Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="screen-title">{period.label}</h1>
        <button type="button" className="btn-secondary" onClick={deletePlanPeriod}>
          計画を削除
        </button>
      </div>

      <div className="month-picker">
        <button type="button" aria-label="前年" onClick={() => setYear((y) => y - 1)}>
          ‹
        </button>
        <strong>{year}年</strong>
        <button type="button" aria-label="翌年" onClick={() => setYear((y) => y + 1)}>
          ›
        </button>
      </div>

      <div className="section">
        <div className="section-title">振込先口座の設定</div>
        <p className="muted">
          振込先口座と振込予定日を設定すると、取り込み時にボーナス収入を自動判定します。
        </p>

        {schedulesInRange.length > 0 && (
          <div className="list" style={{ marginBottom: 12 }}>
            {schedulesInRange.map((schedule) => {
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
        <div className="form-row">
          <label>振込予定日(月・日)</label>
          <div className="button-row">
            <input
              type="number"
              min={1}
              max={12}
              value={scheduleMonthValue}
              onChange={(e) => setScheduleMonth(e.target.value)}
              placeholder="月"
            />
            <span>月</span>
            <input
              type="number"
              min={1}
              max={31}
              value={scheduleDay}
              onChange={(e) => setScheduleDay(e.target.value)}
              placeholder="日"
            />
            <span>日</span>
          </div>
        </div>
        <button type="button" className="btn-primary" onClick={addSchedule}>
          追加
        </button>
        {scheduleAppliedCount !== null && (
          <p className="muted">既存の取引 {scheduleAppliedCount}件にも反映しました</p>
        )}
      </div>

      <div className="section">
        <div className="section-title">集計対象月の設定</div>
        <div className="form-row">
          <label>名称</label>
          <input value={label} onChange={(e) => setLabelEdit(e.target.value)} />
        </div>
        <div className="form-row">
          <label>集計対象月(開始月〜終了月)</label>
          <div className="button-row">
            <input
              type="number"
              min={1}
              max={12}
              value={startMonth}
              onChange={(e) => setStartMonthEdit(e.target.value)}
            />
            <span>〜</span>
            <input
              type="number"
              min={1}
              max={12}
              value={endMonth}
              onChange={(e) => setEndMonthEdit(e.target.value)}
            />
            <button type="button" className="btn-secondary" onClick={updatePeriod}>
              更新
            </button>
          </div>
        </div>
        {periodMessage && <p className="muted">{periodMessage}</p>}
      </div>

      <div className="section">
        <div className="section-title">使用用途の登録</div>
        <p className="muted">
          ボーナスの使用用途を計画します。小カテゴリを指定しなければ大カテゴリ全体への計画になります。
        </p>

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
            {editingPlanId ? "更新" : "反映"}
          </button>
          {editingPlanId && (
            <button type="button" className="btn-secondary" onClick={resetPlanForm}>
              キャンセル
            </button>
          )}
        </div>
        {planMessage && <p className="muted">{planMessage}</p>}

        {plans.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 12 }}>
              <span>総額</span>
              <span className="amount" style={{ float: "right" }}>
                {formatYen(totalPlannedAmount)}
              </span>
            </div>
            <div className="list">
              {plans.map((plan) => {
                const major = majorCategories.find((m) => m.id === plan.majorCategoryID);
                const sub = plan.subcategoryID
                  ? subcategories.find((s) => s.id === plan.subcategoryID)
                  : undefined;
                const planLabel = sub ? `${major?.name ?? "不明"} / ${sub.name}` : major?.name ?? "不明";

                return (
                  <div
                    key={plan.id}
                    className="list-row"
                    style={editingPlanId === plan.id ? { borderColor: "var(--accent)" } : undefined}
                  >
                    <div>
                      <div>{planLabel}</div>
                      <div className="muted">{formatYen(plan.plannedAmount)}</div>
                    </div>
                    <div className="button-row">
                      <button type="button" className="btn-secondary" onClick={() => startEditPlan(plan)}>
                        編集
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => deletePlan(plan.id)}>
                        削除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {plans.length === 0 && <p className="muted">この年の使用計画はまだありません</p>}
      </div>
    </div>
  );
}
