import { NavLink } from "react-router-dom";

/** タブバー相当のナビゲーション(ネイティブ版のTabViewに対応) */
export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
        ホーム
      </NavLink>
      <NavLink to="/import" className={({ isActive }) => (isActive ? "active" : "")}>
        取り込み
      </NavLink>
      <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
        設定
      </NavLink>
    </nav>
  );
}
