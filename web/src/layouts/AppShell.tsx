import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useMatches, type UIMatch } from 'react-router-dom';
import { Breadcrumb, Tag } from '../components/ui';
import { cn } from '../components/ui/shared';

type ShellHandle = {
  actions?: ReactNode | ((match: UIMatch) => ReactNode);
  crumb?: string | ((match: UIMatch) => string);
};

const compactQuery = '(max-width: 1023px)';

const navItems = [
  { accent: 'G', label: 'Generate', to: '/generate' },
  { accent: 'B', label: 'Battle', to: '/battle' },
  { accent: 'R', label: 'Refine', to: '/refine' },
  { accent: 'H', label: 'History', to: '/history' },
  { accent: 'L', label: 'Logs', to: '/logs' },
  { accent: 'E', label: '示例库 / Examples', to: '/examples' },
  { accent: 'S', label: 'Settings', to: '/settings' },
  { accent: 'D', label: 'Design', to: '/design' },
];

function resolveCrumb(match: UIMatch) {
  const handle = match.handle as ShellHandle | undefined;
  if (!handle?.crumb) return null;
  return typeof handle.crumb === 'function' ? handle.crumb(match) : handle.crumb;
}

function resolveActions(match: UIMatch | undefined) {
  const handle = match?.handle as ShellHandle | undefined;
  if (!handle?.actions || !match) return null;
  return typeof handle.actions === 'function' ? handle.actions(match) : handle.actions;
}

function useCompactRail() {
  const [isCompact, setIsCompact] = useState(() => window.matchMedia(compactQuery).matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia(compactQuery);
    const onChange = (event: MediaQueryListEvent) => setIsCompact(event.matches);
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  return isCompact;
}

export default function AppShell() {
  const matches = useMatches();
  const isCompact = useCompactRail();
  const isCollapsed = isCompact;
  const breadcrumbItems = matches
    .map((match) => ({ label: resolveCrumb(match), pathname: match.pathname }))
    .filter((item): item is { label: string; pathname: string } => Boolean(item.label))
    .map((item) => ({ label: item.label, to: item.pathname }));
  const pageActions = resolveActions(matches[matches.length - 1]);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="flex min-h-screen">
        <aside
          className="sticky top-0 flex min-h-screen shrink-0 flex-col border-r border-border bg-surface px-3 py-4 transition-[width]"
          style={{ width: isCollapsed ? 'var(--rail-width-collapsed)' : 'var(--rail-width)' }}
        >
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="overflow-hidden">
              <p className={cn('m-0 text-2xs font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-muted', isCollapsed && 'sr-only')}>PaperBanana</p>
              <p className={cn('m-0 text-lg font-semibold text-primary', isCollapsed && 'sr-only')}>Shell</p>
            </div>
          </div>

          <nav className="mt-6 flex flex-1 flex-col gap-2" aria-label="Primary">
            {navItems.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md border px-3 py-3 text-sm font-medium transition',
                    isActive ? 'border-border-strong bg-subtle text-accent1' : 'border-transparent text-secondary hover:bg-subtle hover:text-primary',
                  )
                }
                key={item.to}
                to={item.to}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-pill bg-subtle text-xs font-semibold text-accent2">{item.accent}</span>
                <span className={cn(isCollapsed && 'sr-only')}>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className={cn('space-y-3 border-t border-border px-1 pt-4', isCollapsed && 'items-center')}>
            <Tag tone="neutral">Providers 0</Tag>
            <p className={cn('m-0 text-xs text-muted', isCollapsed && 'sr-only')}>Registry counts will bind here once Settings data lands.</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header
            className="sticky top-0 z-10 border-b border-border backdrop-blur"
            style={{ backgroundColor: 'color-mix(in srgb, var(--bg-canvas) 95%, transparent)' }}
          >
            <div className="flex items-center justify-between gap-4 px-6 py-4" style={{ minHeight: 'var(--topbar-height)' }}>
              <Breadcrumb items={breadcrumbItems.length ? breadcrumbItems : [{ label: 'Generate' }]} />
              {pageActions ? <div className="flex items-center gap-2">{pageActions}</div> : null}
            </div>
          </header>
          <main className="px-6 py-6">
            <div className="mx-auto w-full" style={{ maxWidth: 'calc(var(--sp-16) * 18)' }}>
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
