'use client';

import { ClientErrorDebugTools } from '../../components/client-error-debug-tools.ts';

export default function Page() {
  return (
    <div style={{ border: '1px solid lightgrey', padding: '12px' }}>
      <h2>Page (/client-component)</h2>
      <ClientErrorDebugTools />
    </div>
  );
}
