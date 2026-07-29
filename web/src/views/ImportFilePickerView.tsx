import { useState, type ChangeEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { readFileForExtraction } from "../lib/claudeExtractionService";

interface LocationState {
  sourceId: string;
}

/** ファイル選択画面(要件定義書 4.1)。ダウンロード済みのCSV/PDFを選択するか、明細ページの内容を貼り付ける */
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

  function handlePastedTextSubmit() {
    if (!state || pastedText.trim() === "") return;
    navigate("/import/preview", {
      state: { sourceId: state.sourceId, file: { data: pastedText, mimeType: "text/csv" } },
    });
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

      <div className="section">
        <div className="section-title">明細ページの内容を貼り付け</div>
        <p className="muted">
          CSVがまだダウンロードできない場合(当月分の未確定明細など)は、明細ページを開いて表示内容を選択・コピーし、ここに貼り付けてください。
          「日付・内容・金額・区分」の列を持つmarkdown表形式(Claude Desktop等で明細を読み取った結果など)であれば、Claude APIを呼ばずに取り込めます。
        </p>
        <textarea
          rows={8}
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          placeholder="明細ページからコピーした内容をここに貼り付け"
        />
        <button
          type="button"
          className="btn-primary"
          style={{ marginTop: 8 }}
          disabled={pastedText.trim() === ""}
          onClick={handlePastedTextSubmit}
        >
          貼り付けた内容を解析
        </button>
      </div>
    </div>
  );
}
