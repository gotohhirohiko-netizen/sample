import { useState, type ChangeEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { readFileForExtraction } from "../lib/claudeExtractionService";

interface LocationState {
  sourceId: string;
}

/** ファイル選択画面(要件定義書 4.1)。ダウンロード済みのCSV/PDFを選択する */
export default function ImportFilePickerView() {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
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
    </div>
  );
}
