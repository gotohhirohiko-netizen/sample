import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import changelogRaw from "../../CHANGELOG.md?raw";

type Block =
  | { kind: "version"; text: string }
  | { kind: "section"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "paragraph"; text: string };

/** CHANGELOG.mdの簡易フォーマット(# 見出し / ## [x.y.z] - 日付 / ### 節 / - 箇条書き / 本文)をブロック列に変換する */
function parseChangelog(markdown: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of markdown.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("# ")) continue;
    if (line.startsWith("## ")) {
      // "## [1.0.0] - 2026-08-01" / "## [未リリース]" の角括弧は表示上不要なので外す
      blocks.push({ kind: "version", text: line.slice(3).trim().replace(/^\[(.+?)\]/, "$1") });
    } else if (line.startsWith("### ")) {
      blocks.push({ kind: "section", text: line.slice(4).trim() });
    } else if (line.startsWith("- ")) {
      blocks.push({ kind: "bullet", text: line.slice(2).trim() });
    } else {
      blocks.push({ kind: "paragraph", text: line });
    }
  }
  return blocks;
}

/** "**強調**" と "`コード`" のみ対応する簡易インラインmarkdownレンダラー */
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|`(.+?)`/g;
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      parts.push(<strong key={key++}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      parts.push(<code key={key++}>{match[2]}</code>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

/** 変更履歴表示画面。web/CHANGELOG.mdをそのまま画面用に整形して表示する */
export default function ChangelogView() {
  const blocks = parseChangelog(changelogRaw);

  return (
    <div>
      <Link to="/settings" className="back-link">
        ‹ 設定へ戻る
      </Link>
      <h1 className="screen-title">変更履歴</h1>

      {blocks.map((block, index) => {
        switch (block.kind) {
          case "version":
            return (
              <div key={index} className="section-title" style={{ marginTop: index === 0 ? 0 : 20 }}>
                {block.text}
              </div>
            );
          case "section":
            return (
              <p key={index} style={{ fontWeight: 600, marginBottom: 4 }}>
                {renderInline(block.text)}
              </p>
            );
          case "bullet":
            return (
              <p key={index} className="muted" style={{ margin: "2px 0 2px 12px" }}>
                ・{renderInline(block.text)}
              </p>
            );
          case "paragraph":
            return (
              <p key={index} className="muted">
                {renderInline(block.text)}
              </p>
            );
        }
      })}
    </div>
  );
}
