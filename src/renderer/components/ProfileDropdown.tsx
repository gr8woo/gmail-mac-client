import type { GmailProfile } from "../../shared/profile";

interface ProfileDropdownProps {
  profiles: GmailProfile[];
  activeProfileId: string | null;
  onSwitchProfile(profileId: string): Promise<void>;
  onOpenManager(): void;
}

export function ProfileDropdown({ profiles, activeProfileId, onSwitchProfile, onOpenManager }: ProfileDropdownProps) {
  const selectedProfileId = profiles.some((profile) => profile.id === activeProfileId)
    ? activeProfileId
    : profiles[0]?.id ?? "";

  return (
    <div className="profile-dropdown">
      <select
        aria-label="Current profile"
        value={selectedProfileId ?? ""}
        onChange={(event) => void onSwitchProfile(event.currentTarget.value)}
      >
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.displayName}
          </option>
        ))}
      </select>
      <button type="button" onClick={onOpenManager}>
        Manage profiles
      </button>
    </div>
  );
}
