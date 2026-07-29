import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { loadAutoBackupOnImport } from "../lib/keyStorage";
import type { ExtractionResult, FileForExtraction } from "../lib/claudeExtractionService";
import { tryParseSeparateColumnBankCsv, tryParseSignedAmountBankCsv } from "../lib/bankCsvParser";
import { tryParseMarkdownTransactionTable } from "../lib/markdownTableParser";
import { tryParsePayPayCardPdf } from "../lib/paypayCardPdfParser";
import { tryParseRakutenCardPdf } from "../lib/rakutenCardPdfParser";
import { tryParseRakutenCardCsv } from "../lib/rakutenCardCsvParser";
import { tryParsePayPayTransactionCsv } from "../lib/paypayTransactionCsvParser";
import {
  isLikelySameMerchant,
  isMerchantAmbiguous,
  merchantMatchKey,
  resolveCategory,
} from "../lib/categoryResolver";
import { formatYen, isSameDay } from "../lib/dateUtils";
import { downloadBackup, exportBackup } from "../lib/backup";
import { matchesBonusIncomeSchedule, suggestBonusIncome } from "../lib/bonusIncomeHeuristic";
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
  const ambiguousFlags = useLiveQuery(() => db.merchantAmbiguousFlags.toArray(), []);
  const existingTransactions = useLiveQuery(() => db.transactions.toArray(), []);
  const bonusIncomeSchedules = useLiveQuery(() => db.bonusIncomeSchedules.toArray(), []);
  const fundingSource = useLiveQuery<FundingSource | undefined>(
    () => (state ? db.fundingSources.get(state.sourceId) : undefined),
    [state?.sourceId]
  );

  const [items, setItems] = useState<PreviewItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excludeDuplicates, setExcludeDuplicates] = useState(true);
  const [hideDuplicates, setHideDuplicates] = useState(true);
  const [isCommitting, setIsCommitting] = useState(false);
  const hasStartedExtractionRef = useRef(false);

  useEffect(() => {
    // mappings/exclusions/existingTransactionsは確定処理自身の書き込みでも
    // 変化するため、これらを依存配列に含めたまま毎回再実行すると、確定処理の
    // 途中で抽出処理全体(PDF解析含む)が再度走ってしまい、コミット中の画面が
    // 中途半端な状態のプレビューに戻ってしまう。抽出は最初の1回だけ実行する。
    if (hasStartedExtractionRef.current) return;
    if (
      !state ||
      !fundingSource ||
      !majorCategories ||
      !subcategories ||
      !mappings ||
      !exclusions ||
      !existingTransactions ||
      !bonusIncomeSchedules ||
      !ambiguousFlags
    ) {
      return;
    }
    hasStartedExtractionRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const parsedCsv =
          state.file.mimeType === "text/csv" && fundingSource.kind === "bankAccount"
            ? (tryParseSignedAmountBankCsv(state.file.data) ??
              tryParseSeparateColumnBankCsv(state.file.data))
            : null;
        const parsedCreditCardCsv =
          !parsedCsv && state.file.mimeType === "text/csv" && fundingSource.kind === "creditCard"
            ? (tryParseRakutenCardCsv(state.file.data) ??
              tryParsePayPayTransactionCsv(state.file.data))
            : null;
        const parsedMarkdown =
          !parsedCsv && !parsedCreditCardCsv && state.file.mimeType === "text/csv"
            ? tryParseMarkdownTransactionTable(state.file.data)
            : null;
        const parsedCreditCardPdf =
          !parsedCsv &&
          !parsedCreditCardCsv &&
          !parsedMarkdown &&
          state.file.mimeType === "application/pdf" &&
          fundingSource.kind === "creditCard"
            ? ((await tryParsePayPayCardPdf(state.file.data)) ??
              (await tryParseRakutenCardPdf(state.file.data)))
            : null;

        let result: ExtractionResult;
        if (parsedCsv) {
          // 列構成が既知の形式(取引日・符号付き入出金額・入出金内容、または
          // 支払い/預かり分離の2列形式)に一致する場合、金額からコード側で
          // 確実にtypeを判定する。
          result = {
            transactions: parsedCsv.map((row) => ({
              date: row.date,
              merchant: row.merchant,
              amount: row.amount,
              type: row.type,
              majorCategory: null,
              subcategory: null,
            })),
          };
        } else if (parsedCreditCardCsv) {
          // 楽天カード(e-NAVI)の当月未確定分CSV(列構成が既知の形式)は、
          // 「当月請求額」列(キャンセル等が反映済みのネット金額)を使って
          // コード側で解析する。
          result = {
            transactions: parsedCreditCardCsv.map((row) => ({
              date: row.date,
              merchant: row.merchant,
              amount: row.amount,
              type: row.type,
              majorCategory: null,
              subcategory: null,
            })),
          };
        } else if (parsedMarkdown) {
          // 「日付・内容・金額・区分」のmarkdownテーブル(statement-fetcherスキル等の
          // 出力形式)に一致する場合は、コード側でそのまま解析する。
          result = {
            transactions: parsedMarkdown.map((row) => ({
              date: row.date,
              merchant: row.merchant,
              amount: row.amount,
              type: row.type,
              majorCategory: null,
              subcategory: null,
            })),
          };
        } else if (parsedCreditCardPdf) {
          // PayPayカード・楽天カードの請求明細PDF(既知のテンプレート)は
          // コード側で解析し、明細書内の「ご請求金額」との検算にも成功した場合のみ
          // ここに来る。
          result = {
            transactions: parsedCreditCardPdf.map((row) => ({
              date: row.date,
              merchant: row.merchant,
              amount: row.amount,
              type: row.type,
              majorCategory: null,
              subcategory: null,
            })),
          };
        } else {
          throw new Error("対応していないファイル形式です。CSVまたはPDFの内容をご確認ください。");
        }

        const resolved: PreviewItem[] = [];
        result.transactions.forEach((item, index) => {
          const date = item.date;
          const subcategoryID = resolveCategory(
            item.merchant,
            item.majorCategory,
            item.subcategory,
            mappings,
            subcategories,
            majorCategories,
            ambiguousFlags
          );
          const isDuplicate = existingTransactions.some(
            (t) =>
              t.sourceInstitutionID === state.sourceId &&
              isSameDay(new Date(t.date), new Date(date)) &&
              isLikelySameMerchant(t.merchant, item.merchant) &&
              t.amount === item.amount
          );
          const excludedFromBudget = exclusions.some(
            (e) => e.merchantKey === merchantMatchKey(item.merchant)
          );
          const isBonusIncome =
            item.type === "income" &&
            (matchesBonusIncomeSchedule(item.date, state.sourceId, bonusIncomeSchedules) ||
              suggestBonusIncome(item.merchant, item.amount, existingTransactions));
          resolved.push({
            key: `${index}-${item.merchant}-${item.amount}`,
            date,
            merchant: item.merchant,
            amount: item.amount,
            type: item.type,
            subcategoryID,
            isDuplicate,
            excludedFromBudget,
            isBonusIncome,
          });
        });

        if (!cancelled) setItems(resolved);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "抽出に失敗しました";
          const stack = err instanceof Error ? err.stack : undefined;
          setError(stack ? `${message}\n\n${stack}` : message);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state,
    fundingSource,
    majorCategories,
    subcategories,
    mappings,
    exclusions,
    existingTransactions,
    bonusIncomeSchedules,
    ambiguousFlags,
  ]);

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

  async function handleCopyError() {
    if (!error) return;
    await navigator.clipboard.writeText(error);
  }

  async function handleCommit() {
    if (!items || !state || isCommitting) return;
    setIsCommitting(true);
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

      if (item.subcategoryID && !isMerchantAmbiguous(item.merchant, ambiguousFlags ?? [])) {
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
      {error && (
        <div>
          <p style={{ color: "var(--danger)", whiteSpace: "pre-wrap" }}>{error}</p>
          <button type="button" onClick={handleCopyError}>
            エラー内容をコピー
          </button>
        </div>
      )}

      {items && majorCategories && subcategories && (
        <>
          {items.some((i) => i.isDuplicate) && (
            <>
              <label className="filter-row">
                <input
                  type="checkbox"
                  checked={excludeDuplicates}
                  onChange={(e) => setExcludeDuplicates(e.target.checked)}
                />
                重複と判断した項目を取り込まない
              </label>
              <label className="filter-row">
                <input
                  type="checkbox"
                  checked={hideDuplicates}
                  onChange={(e) => setHideDuplicates(e.target.checked)}
                />
                重複していないものだけ表示
              </label>
            </>
          )}

          <div className="list">
            {items
              .filter((item) => !hideDuplicates || !item.isDuplicate)
              .map((item) => {
              const willBeExcluded = excludeDuplicates && item.isDuplicate;
              return (
              <div key={item.key} className="card" style={willBeExcluded ? { opacity: 0.5 } : undefined}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{item.merchant}</strong>
                  <span className={`amount ${item.type === "income" ? "income" : "expense"}`}>
                    {item.type === "income" ? "+" : "-"}
                    {formatYen(item.amount)}
                  </span>
                </div>
                <p className="muted">
                  {item.date} ・ {item.type === "income" ? "収入" : "支出"}
                </p>
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
                    {item.isBonusIncome && <span className="muted">(自動推定)</span>}
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
            disabled={items.length === 0 || isCommitting}
            onClick={handleCommit}
            style={{ marginTop: 16 }}
          >
            {isCommitting
              ? "登録中..."
              : `確定 (${(excludeDuplicates ? items.filter((i) => !i.isDuplicate) : items).length}件)`}
          </button>
        </>
      )}
    </div>
  );
}
