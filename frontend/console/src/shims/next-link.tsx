"use client";
/**
 * next/link 的 shim：把 next 的 `href` 映射成 react-router 的 `to`。
 * 造物组件里 <Link href="/reseller/..."> 用法保持原样，不用逐个改调用点。
 */
import { Link as RouterLink, type LinkProps as RouterLinkProps } from "react-router-dom";

export interface LinkProps extends Omit<RouterLinkProps, "to" | "prefetch"> {
    href?: string;
    /** next/link 独有，react-router 没有对应行为，直接吞掉 */
    prefetch?: unknown;
    replace?: boolean;
}

export function Link({ href, children, ...rest }: LinkProps) {
    return (
        <RouterLink to={href ?? "#"} {...(rest as object)}>
            {children}
        </RouterLink>
    );
}

export default Link;
