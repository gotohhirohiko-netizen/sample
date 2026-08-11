export function describeYoutubePlayerError(code: number): string {
  switch (code) {
    case 2:
      return "動画IDが無効です。URLを確認してください。";
    case 5:
      return "プレーヤーの再生中にエラーが発生しました。ブラウザを変えて試してください。";
    case 100:
      return "動画が見つかりません(削除されたか、非公開に設定されている可能性があります)。";
    case 101:
    case 150:
      return (
        "この動画は埋め込み再生できません。埋め込み許可はオンでも、年齢制限がかかっている動画は" +
        "埋め込み再生できない仕様です。また設定変更直後は反映まで数分かかることがあります。"
      );
    default:
      return `不明なエラーです(コード: ${code})。`;
  }
}
