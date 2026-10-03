import { useMemo } from "react";
import { useLocation, useNavigate, useParams as useReactRouterParams } from "react-router-dom";

/**
 * next/navigation 的最小替代实现。
 *
 * 从造物源码原样拷过来的登录页组件里写着 `import { useRouter, useSearchParams } from "next/navigation"`。
 * 为了不改上游代码（保持「完全一样」的可追溯性），控制台在 vite/tsconfig 里把这个模块名
 * 别名到本文件。行为与 Next 的 App Router 版本保持一致。
 */

type NavigateOptions = { replace?: boolean; scroll?: boolean };

function buildHref(path: string) {
    return path;
}

export function useRouter() {
    const navigate = useNavigate();
    return useMemo(
        () => ({
            push: (href: string, opts?: NavigateOptions) => navigate(buildHref(href), { replace: false, ...opts }),
            replace: (href: string, opts?: NavigateOptions) => navigate(buildHref(href), { replace: true, ...opts }),
            back: () => navigate(-1),
            forward: () => navigate(1),
            refresh: () => window.location.reload(),
            prefetch: () => {},
        }),
        [navigate],
    );
}

export function usePathname(): string {
    return useLocation().pathname;
}

/** 与 Next 的 ReadonlyURLSearchParams 兼容：get / has / getAll / toString / entries */
export function useSearchParams(): URLSearchParams {
    const { search } = useLocation();
    return useMemo(() => new URLSearchParams(search), [search]);
}

export function useParams<T extends Record<string, string>>() {
    return useReactRouterParams() as T;
}

export function useSelectedLayoutSegment(): string | null {
    const seg = useLocation().pathname.split("/").filter(Boolean);
    return seg[0] ?? null;
}
