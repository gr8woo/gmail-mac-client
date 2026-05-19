interface StatusBarProps {
  message: string | null;
}

export function StatusBar({ message }: StatusBarProps) {
  if (!message) {
    return null;
  }

  return (
    <p className="status-bar" role="status" title={message}>
      {formatStatusMessage(message)}
    </p>
  );
}

export function formatStatusMessage(message: string): string {
  const normalized = message.replace(/\s+/gu, " ").trim();

  if (
    normalized.length > 240 ||
    normalized.includes("createResumableState(") ||
    normalized.includes("createPrerenderRequest(")
  ) {
    return "앱 상태를 업데이트하는 중 오류가 발생했습니다.";
  }

  return normalized;
}
