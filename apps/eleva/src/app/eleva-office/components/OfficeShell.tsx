import PersonaAvatar from './PersonaAvatar';

export type OfficeTab = 'dashboard' | 'chat' | 'approvals' | 'situations' | 'insights' | 'memory' | 'operations' | 'system';

const TABS: { id: OfficeTab; label: string; description: string }[] = [
  { id: 'dashboard', label: 'Dashboard', description: 'Current objective, active task, and status.' },
  { id: 'chat', label: 'Chat', description: 'Text + controlled voice conversation.' },
  { id: 'approvals', label: 'Approvals', description: 'M6 approval and execution actions.' },
  { id: 'situations', label: 'Situations & Alerts', description: 'M7 situations and alerts.' },
  { id: 'insights', label: 'Business Intelligence', description: 'M8 insights, plans, and decisions.' },
  { id: 'memory', label: 'Memory', description: 'Memory and decision records.' },
  { id: 'operations', label: 'Operations', description: 'Health, deployment, and backup status.' },
  { id: 'system', label: 'System', description: 'Agent status, capabilities, and permissions.' },
];

export default function OfficeShell({
  activeTab,
  onTabChange,
  status,
  voiceState,
  researchBoundary,
  user,
  onLogout,
  children,
}: {
  activeTab: OfficeTab;
  onTabChange: (tab: OfficeTab) => void;
  status: { persona: string; officeContext: string; status: string; activeCapability: string | null; updatedAt: string } | null;
  voiceState: string;
  researchBoundary: { supported: boolean; description: string } | null;
  user: { email: string };
  onLogout: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex min-h-screen bg-luxury-black">
      <aside className="hidden w-60 flex-col border-r border-luxury-border bg-luxury-panel/70 lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <PersonaAvatar persona={status?.persona ?? 'ELEVA'} size="md" />
          <div>
            <div className="text-sm font-semibold text-gold-300">ELEVA</div>
            <div className="text-xs text-luxury-muted">Executive Office</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-luxury-elevated text-gold-200'
                  : 'text-luxury-muted hover:bg-luxury-elevated/70 hover:text-gold-200'
              }`}
            >
              <div className="font-medium">{tab.label}</div>
              <div className="text-xs text-luxury-muted">{tab.description}</div>
            </button>
          ))}
        </nav>
        <div className="space-y-2 border-t border-luxury-border px-5 py-4">
          <div className="text-xs text-luxury-muted">{user?.email}</div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full rounded-lg border border-luxury-border px-3 py-2 text-xs font-semibold text-gold-200 hover:bg-luxury-elevated"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex flex-col gap-3 border-b border-luxury-border bg-luxury-panel/60 px-5 py-4 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <PersonaAvatar persona={status?.persona ?? 'ELEVA'} size="sm" className="lg:hidden" />
            <div>
              <h1 className="text-lg font-semibold text-gold-200">ELEVA Executive Office</h1>
              <p className="text-xs text-luxury-muted">
                {status ? `${status.persona} • ${status.officeContext ?? 'Executive Office'}` : 'Loading…'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-luxury-muted">
            <span className="rounded border border-luxury-border bg-luxury-elevated px-2 py-1">Voice: {voiceState}</span>
            <span className="rounded border border-luxury-border bg-luxury-elevated px-2 py-1">
              Research: {researchBoundary?.supported ? 'available' : 'unavailable'}
            </span>
            <span className="rounded border border-luxury-border bg-luxury-elevated px-2 py-1">
              {status?.status ?? '—'}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto luxury-scrollbar p-5 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
