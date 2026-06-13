interface ActionListCardProps {
  title: string;
  actions: Array<{ id: string; title: string; description?: string }>;
}

export function ActionListCard({ title, actions }: ActionListCardProps) {
  return (
    <div className="action-list-card">
      <h3>{title}</h3>
      <ul>
        {actions.map((action) => (
          <li key={action.id}>
            <strong>{action.title}</strong>
            {action.description ? <p>{action.description}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
