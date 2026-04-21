import { createBrowserRouter, redirect } from 'react-router-dom';
import AppShell from '../layouts/AppShell';
import BattleRoute from './Battle';
import DesignRoute from './Design';
import GenerateRoute from './Generate';
import HistoryRoute from './History';
import LogsRoute from './Logs';
import RefineRoute from './Refine';
import RunDetailRoute from './RunDetail';
import SettingsRoute from './Settings';

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    path: '/',
    children: [
      { index: true, loader: () => redirect('/generate') },
      {
        element: <GenerateRoute />,
        handle: { crumb: 'Generate' },
        path: 'generate',
      },
      {
        element: <BattleRoute />,
        handle: { crumb: 'Battle' },
        path: 'battle',
      },
      {
        element: <RefineRoute />,
        handle: { crumb: 'Refine' },
        path: 'refine',
      },
      {
        element: <HistoryRoute />,
        handle: { crumb: 'History' },
        path: 'history',
      },
      {
        element: <RunDetailRoute />,
        handle: {
          crumb: ({ params }: { params: Record<string, string | undefined> }) =>
            params.runId ? `Run ${String(params.runId).slice(0, 8)}` : 'Run Detail',
        },
        path: 'history/:runId',
      },
      {
        element: <LogsRoute />,
        handle: { crumb: 'Logs' },
        path: 'logs',
      },
      {
        handle: { crumb: '示例库 / Examples' },
        lazy: async () => ({ Component: (await import('./Examples')).default }),
        path: 'examples',
      },
      {
        handle: { crumb: '示例候选池 / Refs' },
        lazy: async () => ({ Component: (await import('./Refs')).default }),
        path: 'refs',
      },
      {
        element: <SettingsRoute />,
        handle: { crumb: 'Settings' },
        path: 'settings',
      },
      {
        element: <DesignRoute />,
        handle: { crumb: 'Design' },
        path: 'design',
      },
    ],
  },
]);
