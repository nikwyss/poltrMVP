import { useState } from 'react';
import { createAppPassword } from './agent';

export function useAppPassword() {
  const [appPassword, setAppPassword] = useState<{
    name: string;
    password: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateAppPassword = async () => {
    setLoading(true);
    setError(null);
    setAppPassword(null);
    try {
      const result = await createAppPassword();
      setAppPassword({ name: result.name, password: result.password });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create app password'
      );
    } finally {
      setLoading(false);
    }
  };

  return { appPassword, loading, error, handleCreateAppPassword };
}
