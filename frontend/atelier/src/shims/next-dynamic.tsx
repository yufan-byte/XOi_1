import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

export default function dynamic<T extends object>(loader: () => Promise<{ default: ComponentType<T> }>, options?: { loading?: () => ReactNode }) {
    const Component = lazy(loader);
    return function DynamicComponent(props: T) {
        return <Suspense fallback={options?.loading?.() ?? null}><Component {...props} /></Suspense>;
    };
}
