import { db } from "./db";

/** 初期カテゴリ一覧(docs/requirements.md 8章のシードデータ) */
const CATEGORY_SEED: { major: string; subs: string[] }[] = [
  { major: "食費", subs: ["食料品", "カフェ", "朝ごはん", "昼ご飯", "晩御飯", "お菓子", "その他"] },
  { major: "日用雑貨", subs: ["消耗品", "子供関連", "その他"] },
  { major: "交通", subs: ["電車", "タクシー", "バス", "飛行機", "その他"] },
  {
    major: "エンタメ",
    subs: ["レジャー", "イベント", "映画・動画", "音楽", "漫画", "書籍", "ゲーム", "その他"],
  },
  {
    major: "教育",
    subs: ["習い事", "参考書", "受験料", "学費", "学資保険", "塾", "習い事物品", "その他"],
  },
  { major: "美容・衣服", subs: ["洋服", "下着", "ジム・健康", "美容院", "コスメ", "その他"] },
  { major: "医療・保健", subs: ["病院代", "薬代", "生命保険", "医療保険", "その他"] },
  { major: "通信", subs: ["携帯電話", "インターネット", "放送サービス", "その他"] },
  { major: "水道・光熱", subs: ["水道料金", "電気料金", "その他"] },
  {
    major: "車",
    subs: ["ガソリン代", "駐車場", "自動車保険", "自動車税", "自動車ローン", "高速料金", "車検", "その他"],
  },
  { major: "その他", subs: ["その他"] },
  { major: "交際費", subs: ["飲み会", "プレゼント", "ご祝儀・香典", "その他"] },
  { major: "税金", subs: ["その他"] },
  { major: "大型出費", subs: ["旅行", "家具", "家電", "ふるさと納税", "その他"] },
];

/** ボーナス払いの初期集計期間(1-6月、7-12月の半年区切り) */
const BONUS_PERIOD_SEED: { label: string; startMonth: number; endMonth: number }[] = [
  { label: "1-6月", startMonth: 1, endMonth: 6 },
  { label: "7-12月", startMonth: 7, endMonth: 12 },
];

/** 初回起動時にボーナス期間マスタが空であればシード投入する */
export async function seedBonusPeriodsIfNeeded(): Promise<void> {
  const existingCount = await db.bonusPeriods.count();
  if (existingCount > 0) return;

  for (let i = 0; i < BONUS_PERIOD_SEED.length; i++) {
    const seed = BONUS_PERIOD_SEED[i];
    await db.bonusPeriods.add({
      id: crypto.randomUUID(),
      label: seed.label,
      startMonth: seed.startMonth,
      endMonth: seed.endMonth,
      displayOrder: i,
    });
  }
}

/** 初回起動時にカテゴリマスタが空であればシード投入する(docs/design.md 7章) */
export async function seedCategoriesIfNeeded(): Promise<void> {
  const existingCount = await db.majorCategories.count();
  if (existingCount > 0) return;

  await db.transaction("rw", db.majorCategories, db.subcategories, async () => {
    for (let majorIndex = 0; majorIndex < CATEGORY_SEED.length; majorIndex++) {
      const seed = CATEGORY_SEED[majorIndex];
      const majorID = crypto.randomUUID();
      await db.majorCategories.add({ id: majorID, name: seed.major, displayOrder: majorIndex });
      for (let subIndex = 0; subIndex < seed.subs.length; subIndex++) {
        await db.subcategories.add({
          id: crypto.randomUUID(),
          majorCategoryID: majorID,
          name: seed.subs[subIndex],
          displayOrder: subIndex,
        });
      }
    }
  });
}
