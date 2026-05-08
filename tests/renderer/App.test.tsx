import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/renderer/App";
import type { GmailProfile, ProfileState } from "../../src/shared/profile";

const workProfile: GmailProfile = {
  id: "profile_1",
  displayName: "Work",
  partition: "persist:gmail-profile-profile_1",
  createdAt: "2026-05-08T00:00:00.000Z",
  updatedAt: "2026-05-08T00:00:00.000Z"
};

const personalProfile: GmailProfile = {
  id: "profile_2",
  displayName: "Personal",
  partition: "persist:gmail-profile-profile_2",
  createdAt: "2026-05-08T00:00:00.000Z",
  updatedAt: "2026-05-08T00:00:00.000Z"
};

function installApi(state: ProfileState) {
  let currentState = state;
  const api = {
    getProfileState: vi.fn().mockImplementation(() => Promise.resolve(currentState)),
    createProfile: vi.fn().mockImplementation((displayName: string) => {
      const profile = { ...workProfile, displayName: displayName.trim() };
      currentState = { profiles: [profile], lastActiveProfileId: profile.id };
      return Promise.resolve(profile);
    }),
    renameProfile: vi.fn().mockResolvedValue(workProfile),
    deleteProfile: vi.fn().mockResolvedValue(undefined),
    switchProfile: vi.fn().mockResolvedValue(undefined)
  };

  Object.defineProperty(window, "gmailClient", {
    value: api,
    configurable: true
  });

  return api;
}

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows first-run profile creation when no profiles exist", async () => {
    installApi({ profiles: [], lastActiveProfileId: null });

    render(<App />);

    expect(await screen.findByText("Create your first Gmail profile")).toBeInTheDocument();
  });

  it("creates the first profile with a trimmed name", async () => {
    const api = installApi({ profiles: [], lastActiveProfileId: null });

    render(<App />);

    fireEvent.change(await screen.findByLabelText("Profile name"), { target: { value: "  Work  " } });
    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));

    await waitFor(() => expect(api.createProfile).toHaveBeenCalledWith("Work"));
  });

  it("shows a compact profile dropdown when profiles exist", async () => {
    installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });

    render(<App />);

    expect(await screen.findByRole("combobox", { name: "Current profile" })).toHaveValue("profile_1");
    expect(screen.getByRole("banner")).toHaveClass("app-bar");
  });

  it("switches profiles from the dropdown", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile, personalProfile]
    });

    render(<App />);

    fireEvent.change(await screen.findByRole("combobox", { name: "Current profile" }), {
      target: { value: "profile_2" }
    });

    await waitFor(() => expect(api.switchProfile).toHaveBeenCalledWith("profile_2"));
  });

  it("does not rename to an unchanged or blank profile name", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Manage profiles" }));
    fireEvent.blur(screen.getByLabelText("Rename Work"), { target: { value: "  Work  " } });
    fireEvent.change(screen.getByLabelText("Rename Work"), { target: { value: "   " } });
    fireEvent.blur(screen.getByLabelText("Rename Work"));

    expect(api.renameProfile).not.toHaveBeenCalled();
  });

  it("confirms before deleting a profile", async () => {
    const api = installApi({
      lastActiveProfileId: "profile_1",
      profiles: [workProfile]
    });
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Manage profiles" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Work" }));

    expect(window.confirm).toHaveBeenCalledWith("Delete this profile and its local Gmail session data?");
    expect(api.deleteProfile).not.toHaveBeenCalled();
  });
});
