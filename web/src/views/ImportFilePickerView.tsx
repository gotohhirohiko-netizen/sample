import { useState, type ChangeEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { readFileForExtraction, type FileForExtraction } from "../lib/claudeExtractionService";

interface LocationState {
  sourceId: string;
}

/**
 * ファイル選択画面(要件定義書 4.1)。ダウンロード済みのCSV/PDFを選択する。
 * CSVダウンロードができない画面(例: e-NAVIモバイル版の当月未確定分)向けに、
 * 明細ページのテキストをそのまま貼り付けて取り込む手段も用意する。
 */
export default function ImportFilePickerView() {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState("");
  const state = location.state as LocationState | null;

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked || !state) return;
    try {
      const file = await readFileForExtraction(picked);
      navigate("/import/preview", { state: { sourceId: state.sourceId, file } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "ファイルの読み込みに失敗しました");
    }
  }

  function handlePasteImport() {
    if (!state || pastedText.trim() === "") return;
    const file: FileForExtraction = { data: pastedText, mimeType: "text/csv" };
    navigate("/import/preview", { state: { sourceId: state.sourceId, file } });
  }

  if (!state) {
    return (
      <div>
        <p className="muted">取り込み元が選択されていません。</p>
        <Link to="/import">‹ 取り込み元選択へ戻る</Link>
      </div>
    );
  }

  return (
    <div>
      <Link to="/import" className="back-link">
        ‹ 取り込み元選択へ戻る
      </Link>
      <h1 className="screen-title">ファイル選択</h1>
      <p className="muted">ダウンロードしたCSV/PDFファイルを選択してください。</p>

      <input type="file" accept=".csv,text/csv,application/pdf" onChange={handleFileChange} />

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="section" style={{ marginTop: 24 }}>
        <div className="section-title">またはテキストを貼り付けて取り込む</div>
        <p className="muted">
          CSV/PDFがダウンロードできない画面(例: スマートフォン版の当月未確定分明細)の場合、
          明細ページの内容をコピーして下の欄に貼り付けてください。
        </p>
        <textarea
          rows={6}
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          placeholder="ここに明細をコピー&ペースト"
        />
        <button
          type="button"
          className="btn-primary"
          style={{ marginTop: 8 }}
          disabled={pastedText.trim() === ""}
          onClick={handlePasteImport}
        >
          貼り付けた内容を取り込む
        </button>
      </div>
    </div>
  );
}
