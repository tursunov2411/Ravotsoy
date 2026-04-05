import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  strong?: boolean;
};

export function Card({ children, className = "", strong = false }: CardProps) {
  return (
    <div
      className={`rounded-[28px] p-6 ${strong ? "surface-card-strong" : "surface-card"} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
