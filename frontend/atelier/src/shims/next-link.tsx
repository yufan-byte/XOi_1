import type { AnchorHTMLAttributes, ReactNode } from "react";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: string | { pathname?: string; query?: Record<string, string> };
    children?: ReactNode;
};

/** Vite 版画布不需要 Next 路由预取，普通同源链接即可。 */
export default function Link({ href, children, ...props }: LinkProps) {
    const target = typeof href === "string" ? href : href.pathname || "/";
    return <a href={target} {...props}>{children}</a>;
}
