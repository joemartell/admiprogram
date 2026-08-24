interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="rise flex flex-wrap items-end justify-between gap-4 border-b border-border/70 pb-5">
      <div className="max-w-2xl">
        <p className="label-xs text-accent">{eyebrow}</p>
        <h1 className="mt-2 text-[28px] font-extrabold">{title}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
