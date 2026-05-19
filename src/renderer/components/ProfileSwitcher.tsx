import type { ActiveGoogleSurface, GmailProfile } from "../../shared/profile";
import { getGoogleAppLabel } from "../../shared/profile";

interface ProfileSwitcherProps {
  profiles: GmailProfile[];
  activeSurface: ActiveGoogleSurface | null;
  onSwitchSurface(surface: ActiveGoogleSurface): Promise<void>;
}

export function ProfileSwitcher({ profiles, activeSurface, onSwitchSurface }: ProfileSwitcherProps) {
  const surfaces = profiles.flatMap((profile) => [
    { profile, appKind: "mail" as const },
    ...(profile.calendarEnabled ? [{ profile, appKind: "calendar" as const }] : [])
  ]);

  return (
    <nav className="profile-switcher" aria-label="Gmail profiles">
      {surfaces.map(({ profile, appKind }) => {
        const label = getProfileLabel(profile);
        const isActive = profile.id === activeSurface?.profileId && appKind === activeSurface.appKind;
        const avatar = profile.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span aria-hidden="true">{getProfileInitial(profile)}</span>
        );

        return (
          <button
            key={`${profile.id}:${appKind}`}
            type="button"
            className="profile-avatar-button"
            aria-label={`Switch to ${label} ${getGoogleAppLabel(appKind)}`}
            aria-current={isActive ? "page" : undefined}
            title={`${label} ${getGoogleAppLabel(appKind)}`}
            onClick={() => void onSwitchSurface({ profileId: profile.id, appKind })}
          >
            {avatar}
            <span className={`profile-app-badge profile-app-badge-${appKind}`} aria-hidden="true">
              {appKind === "calendar" ? "31" : "M"}
            </span>
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
