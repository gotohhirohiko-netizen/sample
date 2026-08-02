import { useEffect, useState } from "react";
import { ensureAuthenticated } from "./lib/supabaseClient";
import { fetchOwnMember } from "./lib/family";
import type { Member } from "./types/models";
import JoinOrCreateView from "./views/JoinOrCreateView";
import ParentApp from "./views/ParentApp";
import ChildChecklistView from "./views/ChildChecklistView";

export default function App() {
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [member, setMember] = useState<Member | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureAuthenticated()
      .then(async (uid) => {
        setAuthUserId(uid);
        const m = await fetchOwnMember(uid);
        setMember(m);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <div className="screen">
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!authUserId || member === undefined) {
    return (
      <div className="screen">
        <p>読み込み中...</p>
      </div>
    );
  }

  if (!member) {
    return <JoinOrCreateView authUserId={authUserId} onJoined={setMember} />;
  }

  if (member.role === "parent") {
    return <ParentApp member={member} />;
  }
  return <ChildChecklistView member={member} />;
}
