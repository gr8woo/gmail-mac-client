import { Mail } from "lucide-react";
import { FormEvent, useState } from "react";

interface FirstRunProps {
  onCreateProfile(displayName: string): Promise<void>;
}

export function FirstRun({ onCreateProfile }: FirstRunProps) {
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const trimmedName = displayName.trim();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!trimmedName) {
      setError("Profile name is required");
      return;
    }

    try {
      await onCreateProfile(trimmedName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create profile");
    }
  }

  return (
    <section className="first-run" aria-labelledby="first-run-title">
      <div className="first-run-mark" aria-hidden="true"><Mail /></div>
      <h1 id="first-run-title">Create your first Gmail profile</h1>
      <p className="first-run-description">메일과 캘린더를 한곳에서. 계정마다 독립된 공간으로 깔끔하게 시작하세요.</p>
      <form onSubmit={submit}>
        <label>
          Profile name
          <input
            autoFocus
            value={displayName}
            onChange={(event) => setDisplayName(event.currentTarget.value)}
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={!trimmedName}>
          Create profile
        </button>
      </form>
    </section>
  );
}
