interface StatusBarProps {
  message: string | null;
}

export function StatusBar({ message }: StatusBarProps) {
  if (!message) {
    return null;
  }

  return (
    <p className="status-bar" role="status">
      {message}
    </p>
  );
}
