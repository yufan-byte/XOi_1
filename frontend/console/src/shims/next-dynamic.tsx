import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

/**
 * next/dynamic 的替代实现（lazy + Suspense）。
 *
 * 上游 `components/login/globe.tsx` 写的是
 *     dynamic(() => import("./orbit-scene"), { ssr: false, loading: () => null })
 * 这里必须接受并忽略 `ssr` —— 客户端渲染的子应用本来就没有服务端渲染这一步。
 */
export default function dynamic<T extends object>(
    loader: () => Promise<{ default: ComponentType<T> }>,
    options?: { loading?: () => ReactNode; ssr?: boolean },
) {
    const Component = lazy(loader);
    return function DynamicComponent(props: T) {
        return (
            <Suspense fallback={options?.loading?.() ?? null}>
                <Component {...props} />
            </Suspense>
        );
    };
}
