import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

// This SPA always renders on the client; retain Next's ssr option in the adapter contract.
export default function dynamic<T extends object>(loader: () => Promise<{ default: ComponentType<T> }>, options?: { loading?: () => ReactNode; ssr?: boolean }) {
    const Component = lazy(loader);
    return function DynamicComponent(props: T) {
        return <Suspense fallback={options?.loading?.() ?? null}><Component {...props} /></Suspense>;
    };
}
