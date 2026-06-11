import type { Metadata } from 'next';
import VerifyClient from './verify-client';

// no-referrer so the ?token=… never leaks via the Referer header to any
// third-party resource or onward navigation. See doc/SECURITY_AUTH.md.
export const metadata: Metadata = {
  referrer: 'no-referrer',
};

export default function VerifyPage() {
  return <VerifyClient />;
}
