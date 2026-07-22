import type { ComponentType } from "react";

type GroupHeaderProps = {
  icon: ComponentType<{ className?: string }>;
  iconColorClassName: string;
  iconBgClassName: string;
  label: string;
  count: number;
};

/**
 * Заголовок группы блока «Добавить на склад»: иконка · лейбл · счётчик.
 * Вынесен из ShoppingGroup, чтобы группа «Своё» (П1) не разъезжалась
 * визуально с категорийными группами и «Прочее».
 */
export function GroupHeader({ icon: Icon, iconColorClassName, iconBgClassName, label, count }: GroupHeaderProps) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBgClassName}`}>
        <Icon className={`h-3.5 w-3.5 ${iconColorClassName}`} />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
        {count}
      </span>
    </div>
  );
}
