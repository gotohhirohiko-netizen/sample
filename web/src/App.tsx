import { useEffect, useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { seedBonusPeriodsIfNeeded, seedCategoriesIfNeeded } from "./lib/seedData";
import { requestPersistentStorage } from "./lib/storagePersistence";
import BottomNav from "./components/BottomNav";
import LockGate from "./components/LockGate";
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
import ImportHistoryView from "./views/ImportHistoryView";
import BonusPlanListView from "./views/BonusPlanListView";
import BonusPlanDetailView from "./views/BonusPlanDetailView";
import BonusActualView from "./views/BonusActualView";
import BonusOtherView from "./views/BonusOtherView";
import BonusCategoryHistoryView from "./views/BonusCategoryHistoryView";
import ApiUsageView from "./views/ApiUsageView";

function AppContent() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    requestPersistentStorage();
    Promise.all([seedCategoriesIfNeeded(), seedBonusPeriodsIfNeeded()]).finally(() =>
      setReady(true)
    );
  }, []);

  if (!ready) {
    return <div className="loading-screen">読み込み中...</div>;
  }

  return (
    <HashRouter>
      <div className="app-shell">
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
            <Route path="/settings/import-history" element={<ImportHistoryView />} />
            <Route path="/settings/api-usage" element={<ApiUsageView />} />
            <Route path="/bonus" element={<BonusPlanListView />} />
            <Route path="/bonus/:periodId" element={<BonusPlanDetailView />} />
            <Route path="/bonus-actual/:periodId/:year" element={<BonusActualView />} />
            <Route path="/bonus-actual/:periodId/:year/other" element={<BonusOtherView />} />
            <Route
              path="/bonus-actual/:periodId/:year/:planId"
              element={<BonusCategoryHistoryView />}
            />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </HashRouter>
  );
}

export default function App() {
  return (
    <LockGate>
      <AppContent />
    </LockGate>
  );
}
