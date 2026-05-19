import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  Mail,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  Sun,
  UserRound
} from "lucide-react";
import type * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { gmailClient } from "../api";
import { MAX_PROFILES } from "../../shared/profile";
import type { GmailProfile } from "../../shared/profile";
import type { AgentProviderId, AgentProviderStatus } from "../../shared/agent";
import { cn } from "../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import { StatusBar } from "./StatusBar";

type SettingsSection = "accounts" | "theme" | "ai";
type ThemePreference = "system" | "light" | "dark";

interface SettingsPageProps {
  profiles: GmailProfile[];
  activeProfileId: string | null;
  onCreateProfile(displayName: string): Promise<void>;
  onRenameProfile(profileId: string, displayName: string): Promise<void>;
  onSetProfileCalendarEnabled(profileId: string, enabled: boolean): Promise<void>;
  onDeleteProfile(profileId: string): Promise<void>;
  onBackToMail(): void;
  status: string | null;
}

const themeStorageKey = "gmail-client-theme";

export function SettingsPage({
  profiles,
  activeProfileId,
  onCreateProfile,
  onRenameProfile,
  onSetProfileCalendarEnabled,
  onDeleteProfile,
  onBackToMail,
  status
}: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>("accounts");
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredThemePreference());

  useEffect(() => {
    applyThemePreference(theme);
  }, [theme]);

  function chooseTheme(nextTheme: ThemePreference) {
    setTheme(nextTheme);
    localStorage.setItem(themeStorageKey, nextTheme);
  }

  return (
    <main className="settings-page" aria-label="Settings">
      <header className="settings-titlebar">
        <Button type="button" variant="ghost" size="icon" className="settings-back-button" onClick={onBackToMail}>
          <ArrowLeft aria-hidden="true" />
          <span className="visually-hidden">메일로 돌아가기</span>
        </Button>
        <h1>{getSettingsTitle(section)}</h1>
        <StatusBar message={status} />
      </header>

      <div className="settings-body">
        <nav className="settings-nav" aria-label="Settings navigation">
          <Button
            type="button"
            variant={section === "accounts" ? "secondary" : "ghost"}
            aria-current={section === "accounts" ? "page" : undefined}
            onClick={() => setSection("accounts")}
          >
            <UserRound aria-hidden="true" />
            계정
          </Button>
          <Button
            type="button"
            variant={section === "theme" ? "secondary" : "ghost"}
            aria-current={section === "theme" ? "page" : undefined}
            onClick={() => setSection("theme")}
          >
            <Monitor aria-hidden="true" />
            테마
          </Button>
          <Button
            type="button"
            variant={section === "ai" ? "secondary" : "ghost"}
            aria-current={section === "ai" ? "page" : undefined}
            onClick={() => setSection("ai")}
          >
            <Bot aria-hidden="true" />
            AI 연결
          </Button>
        </nav>

        {section === "accounts" ? (
          <AccountSettings
            profiles={profiles}
            activeProfileId={activeProfileId}
            onCreateProfile={onCreateProfile}
            onRenameProfile={onRenameProfile}
            onSetProfileCalendarEnabled={onSetProfileCalendarEnabled}
            onDeleteProfile={onDeleteProfile}
          />
        ) : section === "theme" ? (
          <ThemeSettings theme={theme} onChooseTheme={chooseTheme} />
        ) : (
          <AiConnectionSettings />
        )}
      </div>
    </main>
  );
}

interface AccountSettingsProps {
  profiles: GmailProfile[];
  activeProfileId: string | null;
  onCreateProfile(displayName: string): Promise<void>;
  onRenameProfile(profileId: string, displayName: string): Promise<void>;
  onSetProfileCalendarEnabled(profileId: string, enabled: boolean): Promise<void>;
  onDeleteProfile(profileId: string): Promise<void>;
}

function AccountSettings({
  profiles,
  activeProfileId,
  onCreateProfile,
  onRenameProfile,
  onSetProfileCalendarEnabled,
  onDeleteProfile
}: AccountSettingsProps) {
  const [selectedProfileId, setSelectedProfileId] = useState(activeProfileId ?? profiles[0]?.id ?? "");
  const [newProfileName, setNewProfileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0],
    [profiles, selectedProfileId]
  );
  const hasProfileCapacity = profiles.length < MAX_PROFILES;
  const trimmedNewProfileName = newProfileName.trim();

  async function createProfile() {
    setError(null);

    if (!hasProfileCapacity) {
      setError(`You can create up to ${MAX_PROFILES} Gmail profiles`);
      return;
    }

    if (!trimmedNewProfileName) {
      setError("Profile name is required");
      return;
    }

    try {
      await onCreateProfile(trimmedNewProfileName);
      setNewProfileName("");
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
    <section className="settings-content" aria-label="Profile management" tabIndex={0}>
      <Card className="account-card">
        <CardHeader>
          <CardTitle>메일 계정</CardTitle>
        </CardHeader>
        <CardContent className="account-card-content">
          <div className="account-list">
            {profiles.map((profile, index) => {
              const isDefault = profile.id === activeProfileId;
              const isSelected = profile.id === selectedProfile?.id;

              return (
                <button
                  key={profile.id}
                  type="button"
                  className={cn("account-row", isSelected && "account-row-selected")}
                  onClick={() => setSelectedProfileId(profile.id)}
                >
                  <Mail className="account-provider-icon" aria-hidden="true" />
                  <span className="account-row-copy">
                    <span className="account-provider-name">Google</span>
                    <span className="account-email">{profile.email ?? profile.displayName}</span>
                  </span>
                  {isDefault ? <Badge>기본값</Badge> : null}
                  <ChevronRight className="account-chevron" aria-hidden="true" />
                  {index < profiles.length - 1 ? <span className="account-row-separator" /> : null}
                </button>
              );
            })}
          </div>

          <div className="add-account-row">
            <Input
              aria-label="New profile name"
              placeholder="새 계정 이름"
              value={newProfileName}
              disabled={!hasProfileCapacity}
              onChange={(event) => setNewProfileName(event.currentTarget.value)}
            />
            <Button
              type="button"
              variant="ghost"
              className="add-account-button"
              disabled={!hasProfileCapacity || !trimmedNewProfileName}
              onClick={() => void createProfile()}
            >
              <Plus aria-hidden="true" />
              계정 추가
            </Button>
          </div>
          <div className="profile-count">{profiles.length} / {MAX_PROFILES}</div>
          {error ? <p role="alert" className="settings-error">{error}</p> : null}
        </CardContent>
      </Card>

      {selectedProfile ? (
        <Card className="account-detail-card">
          <CardHeader>
            <CardTitle>프로필 관리</CardTitle>
          </CardHeader>
          <CardContent className="account-detail-content">
            <Avatar className="h-14 w-14">
              {selectedProfile.avatarUrl ? (
                <AvatarImage src={selectedProfile.avatarUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <AvatarFallback>{getProfileInitial(selectedProfile)}</AvatarFallback>
              )}
            </Avatar>
            <div className="account-detail-fields">
              <label>
                표시 이름
                <Input
                  aria-label={`Rename ${selectedProfile.displayName}`}
                  defaultValue={selectedProfile.displayName}
                  onBlur={(event) => void rename(selectedProfile, event.currentTarget.value)}
                />
              </label>
              <label>
                이메일
                <Input value={selectedProfile.email ?? ""} readOnly />
              </label>
            </div>
            <Separator />
            <div className="account-app-settings">
              <div>
                <div className="account-app-title">Gmail</div>
                <div className="account-app-description">Always enabled for this profile.</div>
              </div>
              <Badge>On</Badge>
            </div>
            <label className="account-app-settings">
              <span>
                <span className="account-app-title">Calendar</span>
                <span className="account-app-description">
                  Show Google Calendar as a top-bar surface for this profile.
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label={`Enable Calendar for ${selectedProfile.displayName}`}
                checked={selectedProfile.calendarEnabled}
                onChange={(event) =>
                  void onSetProfileCalendarEnabled(selectedProfile.id, event.currentTarget.checked)
                }
              />
            </label>
            <Separator />
            <Button
              type="button"
              variant="destructive"
              aria-label={`Delete ${selectedProfile.displayName}`}
              onClick={() => void onDeleteProfile(selectedProfile.id)}
            >
              삭제
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

interface ThemeSettingsProps {
  theme: ThemePreference;
  onChooseTheme(theme: ThemePreference): void;
}

function ThemeSettings({ theme, onChooseTheme }: ThemeSettingsProps) {
  return (
    <section className="settings-content" aria-label="Theme settings" tabIndex={0}>
      <Card>
        <CardHeader>
          <CardTitle>테마</CardTitle>
        </CardHeader>
        <CardContent className="theme-options">
          <ThemeButton
            label="시스템"
            icon={<Monitor aria-hidden="true" />}
            selected={theme === "system"}
            onClick={() => onChooseTheme("system")}
          />
          <ThemeButton
            label="밝게"
            icon={<Sun aria-hidden="true" />}
            selected={theme === "light"}
            onClick={() => onChooseTheme("light")}
          />
          <ThemeButton
            label="어둡게"
            icon={<Moon aria-hidden="true" />}
            selected={theme === "dark"}
            onClick={() => onChooseTheme("dark")}
          />
        </CardContent>
      </Card>
    </section>
  );
}

interface ThemeButtonProps {
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick(): void;
}

function ThemeButton({ label, icon, selected, onClick }: ThemeButtonProps) {
  return (
    <Button type="button" variant={selected ? "secondary" : "outline"} aria-pressed={selected} onClick={onClick}>
      {icon}
      {label}
    </Button>
  );
}

function AiConnectionSettings() {
  const [providers, setProviders] = useState<AgentProviderStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refreshStatus() {
    setIsLoading(true);
    setError(null);

    try {
      setProviders(await gmailClient.getAgentProviders());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 연결 상태를 가져오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  async function startLogin(providerId: AgentProviderId) {
    setError(null);

    try {
      await gmailClient.startAgentProviderLogin(providerId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "로그인 창을 열지 못했습니다.");
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  return (
    <section className="settings-content" aria-label="AI connections" tabIndex={0}>
      <Card>
        <CardHeader>
          <CardTitle>구독 서비스 연결</CardTitle>
        </CardHeader>
        <CardContent className="ai-connection-content">
          {providers.map((provider) => {
            const isConnected = provider.installed && provider.authenticated;
            const needsInstall = !provider.installed;

            return (
              <div key={provider.id} className="ai-provider-card">
                <div className="ai-provider-row">
                  <div className="ai-provider-icon">
                    <Bot aria-hidden="true" />
                  </div>
                  <div className="ai-provider-copy">
                    <strong>{provider.name}</strong>
                    <span>{provider.description}</span>
                    {provider.version ? <span>{provider.version}</span> : null}
                  </div>
                  <span className={isConnected ? "ai-status ai-status-connected" : "ai-status"}>
                    {isConnected ? <CheckCircle2 aria-hidden="true" /> : null}
                    {isLoading ? "확인 중" : isConnected ? "연결됨" : needsInstall ? "설치 필요" : "로그인 필요"}
                  </span>
                </div>

                <p className="ai-connection-detail">{provider.detail}</p>
                <div className="ai-provider-actions">
                  <code>{provider.loginCommand}</code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={needsInstall}
                    onClick={() => void startLogin(provider.id)}
                  >
                    로그인 시작
                  </Button>
                </div>
              </div>
            );
          })}

          {error ? <p role="alert" className="settings-error">{error}</p> : null}
          <p className="ai-connection-help">
            새 Mac에 앱을 설치한 경우 각 서비스 CLI를 설치하고 이 화면에서 로그인한 뒤 상태를 새로고침하세요.
          </p>
          <Button type="button" variant="outline" onClick={() => void refreshStatus()}>
            <RefreshCw aria-hidden="true" />
            상태 새로고침
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

function getSettingsTitle(section: SettingsSection): string {
  if (section === "accounts") {
    return "계정";
  }

  if (section === "theme") {
    return "테마";
  }

  return "AI 연결";
}

function getStoredThemePreference(): ThemePreference {
  const storedTheme = localStorage.getItem(themeStorageKey);
  return storedTheme === "light" || storedTheme === "dark" || storedTheme === "system" ? storedTheme : "system";
}

function applyThemePreference(theme: ThemePreference) {
  const resolvedTheme =
    theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : theme;
  document.documentElement.dataset.theme = resolvedTheme === "system" ? "system" : resolvedTheme;
}

function getProfileInitial(profile: GmailProfile): string {
  return (profile.email || profile.displayName).trim().charAt(0).toUpperCase() || "?";
}
