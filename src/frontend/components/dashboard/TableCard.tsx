interface TableCardProps {
  title: string;
  columns: string[];
  rows: Array<Record<string, string | number>>;
}

export function TableCard({ title, columns, rows }: TableCardProps) {
  return (
    <div className="table-card">
      <h3>{title}</h3>
      <table>
        <thead>
          <tr>{columns.map((column) => (<th key={column}>{column}</th>))}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (<td key={column}>{row[column]}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
