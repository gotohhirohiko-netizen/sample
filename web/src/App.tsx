import { useEffect, useState } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { seedCategoriesIfNeeded } from "./lib/seedData";
import BottomNav from "./components/BottomNav";
import HomeView from "./views/HomeView";
import DailyListView from "./views/DailyListView";
import MonthlyBudgetView from "./views/MonthlyBudgetView";
import CategoryDrilldownView from "./views/CategoryDrilldownView";
import TransactionDetailView from "./views/TransactionDetailView";
import ImportSourceSelectView from "./views/ImportSourceSelectView";
import ImportFilePickerView from "./views/ImportFilePickerView";
import ExtractionPreviewView from "./views/ExtractionPreviewView";
import SettingsView from "./views/SettingsView";
import CategoryBudgetManageView from "./views/CategoryBudgetManageView";
import FundingSourceManageView from "./views/FundingSourceManageView";
import BackupView from "./views/BackupView";

/**
 * iOS(WKWebView)は画面遷移後、特に<select>のネイティブピッカーを
 * 閉じた直後などに、スクロールコンテナの再描画をサボって黒画面/白画面の
 * まま止まることがある。スクロールで直ることからも分かる通り単なる
 * 再描画漏れなので、画面遷移のたびに強制的にreflowさせて回避する。
 */
function RepaintOnNavigate() {
  const location = useLocation();
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".app-content");
    if (!el) return;
    el.style.display = "none";
    void el.offsetHeight;
    el.style.display = "";
  }, [location.pathname]);
  return null;
}

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    seedCategoriesIfNeeded().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return <div className="loading-screen">読み込み中...</div>;
  }

  return (
    <HashRouter>
      <div className="app-shell">
        <RepaintOnNavigate />
        <main className="app-content">
          <Routes>
            <Route path="/" element={<HomeView />} />
            <Route path="/daily/:month" element={<DailyListView />} />
            <Route path="/budget/:month" element={<MonthlyBudgetView />} />
            <Route path="/budget/:month/:majorCategoryId" element={<CategoryDrilldownView />} />
            <Route path="/transactions/:id" element={<TransactionDetailView />} />
            <Route path="/import" element={<ImportSourceSelectView />} />
            <Route path="/import/file" element={<ImportFilePickerView />} />
            <Route path="/import/preview" element={<ExtractionPreviewView />} />
            <Route path="/settings" element={<SettingsView />} />
            <Route path="/settings/categories" element={<CategoryBudgetManageView />} />
            <Route path="/settings/sources" element={<FundingSourceManageView />} />
            <Route path="/settings/backup" element={<BackupView />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </HashRouter>
  );
}
