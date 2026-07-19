import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { loadApiKey, loadAutoBackupOnImport } from "../lib/keyStorage";
import {
  extractTransactions,
  type FileForExtraction,
} from "../lib/claudeExtractionService";
import { merchantMatchKey, resolveCategory } from "../lib/categoryResolver";
import { formatYen, isSameDay } from "../lib/dateUtils";
import { downloadBackup, exportBackup } from "../lib/backup";
import { suggestBonusIncome } from "../lib/bonusIncomeHeuristic";
import type { FundingSource, Transaction } from "../types/models";

interface LocationState {
  sourceId: string;
  file: FileForExtraction;
}

interface PreviewItem {
  key: string;
  date: string;
  merchant: string;
  amount: number;
  type: Transaction["type"];
  subcategoryID: string | null;
  isDuplicate: boolean;
  excludedFromBudget: boolean;
  isBonusIncome: boolean;
}

/** 抽出結果プレビュー画面(要件定義書 4.2/4.9、docs/design.md 4.4/5章) */
export default function ExtractionPreviewView() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const majorCategories = useLiveQuery(
    () => db.majorCategories.orderBy("displayOrder").toArray(),
    []
  );
  const subcategories = useLiveQuery(() => db.subcategories.toArray(), []);
  const mappings = useLiveQuery(() => db.merchantCategoryMappings.toArray(), []);
  const exclusions = useLiveQuery(() => db.merchantExclusions.toArray(), []);
  const existingTransactions = useLiveQuery(() => db.transactions.toArray(), []);
  const fundingSource = useLiveQuery<FundingSource | undefined>(
    () => (state ? db.fundingSources.get(state.sourceId) : undefined),
    [state?.sourceId]
  );

  const [items, setItems] = useState<PreviewItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excludeDuplicates, setExcludeDuplicates] = useState(true);

  useEffect(() => {
    if (
      !state ||
      !fundingSource ||
      !majorCategories ||
      !subcategories ||
      !mappings ||
      !exclusions ||
      !existingTransactions
    ) {
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const apiKey = await loadApiKey();
        if (!apiKey) throw new Error("Anthropic APIキーが未設定です。設定画面から登録してください。");

        const result = await extractTransactions(
          apiKey,
          state.file,
          fundingSource.kind,
          majorCategories.map((c) => c.name)
        );

        const resolved: PreviewItem[] = result.transactions.map((item, index) => {
          const date = item.date;
          const subcategoryID = resolveCategory(
            item.merchant,
            item.majorCategory,
            item.subcategory,
            mappings,
            subcategories,
            majorCategories
          );
          const isDuplicate = existingTransactions.some(
            (t) =>
              isSameDay(new Date(t.date), new Date(date)) &&
              merchantMatchKey(t.merchant) === merchantMatchKey(item.merchant) &&
              t.amount === item.amount
          );
          const excludedFromBudget = exclusions.some(
            (e) => e.merchantKey === merchantMatchKey(item.merchant)
          );
          const isBonusIncome =
            item.type === "income" && suggestBonusIncome(item.merchant, item.amount, existingTransactions);
          return {
            key: `${index}-${item.merchant}-${item.amount}`,
            date,
            merchant: item.merchant,
            amount: item.amount,
            type: item.type,
            subcategoryID,
            isDuplicate,
            excludedFromBudget,
            isBonusIncome,
          };
        });

        if (!cancelled) setItems(resolved);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "抽出に失敗しました");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, fundingSource, majorCategories, subcategories, mappings, exclusions, existingTransactions]);

  if (!state) {
    return (
      <div>
        <p className="muted">取り込み情報がありません。</p>
        <Link to="/import">‹ 取り込み元選択へ戻る</Link>
      </div>
    );
  }

  function updateItem(key: string, patch: Partial<PreviewItem>) {
    setItems((prev) => prev?.map((it) => (it.key === key ? { ...it, ...patch } : it)) ?? prev);
  }

  async function handleCommit() {
    if (!items || !state) return;
    const now = new Date().toISOString();
    const itemsToCommit = excludeDuplicates ? items.filter((i) => !i.isDuplicate) : items;

    for (const item of itemsToCommit) {
      const id = crypto.randomUUID();
      const transaction: Transaction = {
        id,
        date: item.date,
        merchant: item.merchant,
        amount: item.amount,
        type: item.type,
        subcategoryID: item.subcategoryID,
        sourceInstitutionID: state.sourceId,
        memo: null,
        importedAt: now,
        excludedFromBudget: item.excludedFromBudget,
        isBonusPayment: false,
        isBonusIncome: item.isBonusIncome,
      };
      await db.transactions.add(transaction);

      if (item.subcategoryID) {
        const key = merchantMatchKey(item.merchant);
        const existing = await db.merchantCategoryMappings
          .where("merchantKey")
          .equals(key)
          .first();
        if (existing) {
          await db.merchantCategoryMappings.update(existing.id, {
            subcategoryID: item.subcategoryID,
            updatedAt: now,
          });
        } else {
          await db.merchantCategoryMappings.add({
            id: crypto.randomUUID(),
            merchantKey: key,
            subcategoryID: item.subcategoryID,
            updatedAt: now,
          });
        }
      }

      const exclusionKey = merchantMatchKey(item.merchant);
      const existingExclusion = await db.merchantExclusions
        .where("merchantKey")
        .equals(exclusionKey)
        .first();
      if (item.excludedFromBudget) {
        if (existingExclusion) {
          await db.merchantExclusions.update(existingExclusion.id, { updatedAt: now });
        } else {
          await db.merchantExclusions.add({
            id: crypto.randomUUID(),
            merchantKey: exclusionKey,
            updatedAt: now,
          });
        }
      } else if (existingExclusion) {
        await db.merchantExclusions.delete(existingExclusion.id);
      }
    }

    if (itemsToCommit.length > 0 && (await loadAutoBackupOnImport())) {
      const payload = await exportBackup();
      downloadBackup(payload);
    }

    navigate("/");
  }

  return (
    <div>
      <Link to="/import" className="back-link">
        ‹ キャンセル
      </Link>
      <h1 className="screen-title">抽出結果</h1>

      {isLoading && <p className="muted">解析中...</p>}
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {items && majorCategories && subcategories && (
        <>
          {items.some((i) => i.isDuplicate) && (
            <label className="filter-row">
              <input
                type="checkbox"
                checked={excludeDuplicates}
                onChange={(e) => setExcludeDuplicates(e.target.checked)}
              />
              重複と判断した項目を取り込まない
            </label>
          )}

          <div className="list">
            {items.map((item) => {
              const willBeExcluded = excludeDuplicates && item.isDuplicate;
              return (
              <div key={item.key} className="card" style={willBeExcluded ? { opacity: 0.5 } : undefined}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{item.merchant}</strong>
                  <span>{formatYen(item.amount)}</span>
                </div>
                <p className="muted">{item.date}</p>
                {item.isDuplicate && (
                  <p style={{ color: "var(--danger)" }}>
                    重複の可能性があります{willBeExcluded && "(取り込まれません)"}
                  </p>
                )}
                <label className="filter-row">
                  <input
                    type="checkbox"
                    checked={item.excludedFromBudget}
                    onChange={(e) =>
                      updateItem(item.key, { excludedFromBudget: e.target.checked })
                    }
                  />
                  家計に含めない
                </label>
                {item.type === "income" && (
                  <label className="filter-row">
                    <input
                      type="checkbox"
                      checked={item.isBonusIncome}
                      onChange={(e) => updateItem(item.key, { isBonusIncome: e.target.checked })}
                    />
                    ボーナス収入(賞与等)
                    {item.isBonusIncome && <span className="muted">(金額から推定)</span>}
                  </label>
                )}
                {item.type === "expense" && (
                  <select
                    value={item.subcategoryID ?? ""}
                    onChange={(e) =>
                      updateItem(item.key, { subcategoryID: e.target.value === "" ? null : e.target.value })
                    }
                  >
                    <option value="">未分類</option>
                    {majorCategories.map((major) => (
                      <optgroup key={major.id} label={major.name}>
                        {subcategories
                          .filter((s) => s.majorCategoryID === major.id)
                          .map((sub) => (
                            <option key={sub.id} value={sub.id}>
                              {sub.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                )}
              </div>
              );
            })}
          </div>

          <button
            type="button"
            className="btn-primary"
            disabled={items.length === 0}
            onClick={handleCommit}
            style={{ marginTop: 16 }}
          >
            確定 ({(excludeDuplicates ? items.filter((i) => !i.isDuplicate) : items).length}件)
          </button>
        </>
      )}
    </div>
  );
}
