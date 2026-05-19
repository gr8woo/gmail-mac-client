import type { GmailProfile } from "../../shared/profile";

interface ProfileSwitcherProps {
  profiles: GmailProfile[];
  activeProfileId: string | null;
  onSwitchProfile(profileId: string): Promise<void>;
}

export function ProfileSwitcher({ profiles, activeProfileId, onSwitchProfile }: ProfileSwitcherProps) {
  return (
    <nav className="profile-switcher" aria-label="Gmail profiles">
      {profiles.map((profile) => {
        const label = getProfileLabel(profile);
        const isActive = profile.id === activeProfileId;

        return (
          <button
            key={profile.id}
            type="button"
            className="profile-avatar-button"
            aria-label={`Switch to ${label}`}
            aria-current={isActive ? "page" : undefined}
            title={label}
            onClick={() => void onSwitchProfile(profile.id)}
          >
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span aria-hidden="true">{getProfileInitial(profile)}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function getProfileLabel(profile: GmailProfile): string {
  return profile.email || profile.displayName;
}

function getProfileInitial(profile: GmailProfile): string {
  const source = profile.email || profile.displayName;
  return source.trim().charAt(0).toUpperCase() || "?";
}
