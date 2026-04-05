import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

type BaseProps = {
  children: ReactNode;
  className?: string;
  variant?: "primary" | "secondary";
};

type ButtonProps = BaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    to?: never;
    href?: never;
  };

type LinkProps = BaseProps & {
  to: string;
  state?: unknown;
  href?: never;
};

type AnchorProps = BaseProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    to?: never;
  };

type Props = ButtonProps | LinkProps | AnchorProps;

function classes(variant: "primary" | "secondary", className?: string) {
  const base = variant === "secondary" ? "premium-button-secondary" : "premium-button";
  return `${base} ${className ?? ""}`.trim();
}

export function Button(props: Props) {
  const { children, className, variant = "primary" } = props;

  if ("to" in props && props.to) {
    return (
      <Link to={props.to} state={props.state} className={classes(variant, className)}>
        {children}
      </Link>
    );
  }

  if ("href" in props && props.href) {
    const { href, children: _children, className: _className, variant: _variant, ...rest } = props;
    return (
      <a href={href} className={classes(variant, className)} {...rest}>
        {children}
      </a>
    );
  }

  const { type = "button", children: _children, className: _className, variant: _variant, ...rest } =
    props as ButtonProps;

  return (
    <button type={type} className={classes(variant, className)} {...rest}>
      {children}
    </button>
  );
}
