import { FormEvent, useState } from "react";
import type { GmailProfile } from "../../shared/profile";

interface ProfileManagerProps {
  profiles: GmailProfile[];
  onCreateProfile(displayName: string): Promise<void>;
  onRenameProfile(profileId: string, displayName: string): Promise<void>;
  onDeleteProfile(profileId: string): Promise<void>;
  onClose(): void;
}

export function ProfileManager({
  profiles,
  onCreateProfile,
  onRenameProfile,
  onDeleteProfile,
  onClose
}: ProfileManagerProps) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const trimmedNewName = newName.trim();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!trimmedNewName) {
      setError("Profile name is required");
      return;
    }

    try {
      await onCreateProfile(trimmedNewName);
      setNewName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add profile");
    }
  }

  async function rename(profile: GmailProfile, value: string) {
    const nextName = value.trim();

    if (!nextName || nextName === profile.displayName) {
      return;
    }

    try {
      await onRenameProfile(profile.id, nextName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to rename profile");
    }
  }

  return (
    <div className="app-bar-manager" role="toolbar" aria-label="Profile management">
      <form onSubmit={submit}>
        <label>
          New profile name
          <input value={newName} onChange={(event) => setNewName(event.currentTarget.value)} />
        </label>
        <button type="submit" disabled={!trimmedNewName}>
          Add profile
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      <ul>
        {profiles.map((profile) => (
          <li key={profile.id}>
            <input
              aria-label={`Rename ${profile.displayName}`}
              defaultValue={profile.displayName}
              onBlur={(event) => void rename(profile, event.currentTarget.value)}
            />
            <button type="button" onClick={() => void onDeleteProfile(profile.id)}>
              Delete {profile.displayName}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
