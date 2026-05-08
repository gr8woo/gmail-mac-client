import { useEffect, useState } from "react";
import { gmailClient } from "./api";
import { FirstRun } from "./components/FirstRun";
import { ProfileDropdown } from "./components/ProfileDropdown";
import { ProfileManager } from "./components/ProfileManager";
import { StatusBar } from "./components/StatusBar";
import type { ProfileState } from "../shared/profile";

export function App() {
  const [state, setState] = useState<ProfileState | null>(null);
  const [isManagingProfiles, setIsManagingProfiles] = useState(false);
  const [status, setStatus] = useState<string | null>("Loading profiles...");

  async function refreshState(options: { clearStatus?: boolean } = {}) {
    const nextState = await gmailClient.getProfileState();
    setState(nextState);
    if (options.clearStatus ?? true) {
      setStatus(null);
    }
  }

  useEffect(() => {
    void refreshState().catch((caught) => {
      setStatus(caught instanceof Error ? caught.message : "Unable to load profiles");
    });
  }, []);

  async function createProfile(displayName: string) {
    await gmailClient.createProfile(displayName);
    await refreshState();
  }

  async function switchProfile(profileId: string) {
    if (!profileId || profileId === state?.lastActiveProfileId) {
      return;
    }

    try {
      await gmailClient.switchProfile(profileId);
      await refreshState();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Unable to switch profile");
      await refreshState({ clearStatus: false }).catch(() => undefined);
    }
  }

  async function renameProfile(profileId: string, displayName: string) {
    await gmailClient.renameProfile(profileId, displayName);
    await refreshState();
  }

  async function deleteProfile(profileId: string) {
    const confirmed = window.confirm("Delete this profile and its local Gmail session data?");

    if (!confirmed) {
      return;
    }

    try {
      await gmailClient.deleteProfile(profileId);
      await refreshState();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Unable to delete profile");
      await refreshState({ clearStatus: false }).catch(() => undefined);
    }
  }

  if (!state) {
    return <StatusBar message={status} />;
  }

  if (state.profiles.length === 0) {
    return (
      <main className="app-shell first-run-shell">
        <FirstRun onCreateProfile={createProfile} />
        <StatusBar message={status} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-bar">
        {isManagingProfiles ? (
          <ProfileManager
            profiles={state.profiles}
            onCreateProfile={createProfile}
            onRenameProfile={renameProfile}
            onDeleteProfile={deleteProfile}
            onClose={() => setIsManagingProfiles(false)}
          />
        ) : (
          <ProfileDropdown
            profiles={state.profiles}
            activeProfileId={state.lastActiveProfileId}
            onSwitchProfile={switchProfile}
            onOpenManager={() => setIsManagingProfiles(true)}
          />
        )}
        <StatusBar message={status} />
      </header>
    </main>
  );
}
