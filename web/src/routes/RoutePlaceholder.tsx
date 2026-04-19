import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, Tag } from '../components/ui';

type RoutePlaceholderProps = {
  children?: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
};

export function RoutePlaceholder({ children, description, eyebrow, title }: RoutePlaceholderProps) {
  return (
    <div className="space-y-6">
      <Card
        actions={
          <Link
            className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-3 text-sm font-medium text-primary transition hover:border-border-strong hover:text-accent2"
            to="/design"
          >
            Open design sandbox
          </Link>
        }
        subtitle={description}
        title={title}
      >
        <div className="space-y-4">
          <Tag>{eyebrow}</Tag>
          <p className="m-0 max-w-3xl text-sm text-secondary">
            This route is wired into the shell and ready for the feature task that owns its real workflow.
          </p>
        </div>
      </Card>
      {children ?? (
        <Empty
          description="The page contract is already routable, themed, and wrapped by the shared application shell."
          title={`${title} placeholder`}
        />
      )}
    </div>
  );
}
