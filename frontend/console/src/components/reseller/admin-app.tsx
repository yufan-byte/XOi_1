import { Children, cloneElement, isValidElement } from "react";
import { Route, Routes, type RouteProps } from "react-router-dom";
import { AdminGate, adminRoutes } from "./admin-routes";

// This subtree is mounted at /reseller/*; nested Routes match the remaining path.
const routes = Children.map(adminRoutes.props.children, child =>
  isValidElement<RouteProps>(child) && child.props.path?.startsWith("/reseller")
    ? cloneElement(child, { path: child.props.path?.replace(/^\/reseller\/?/, "") })
    : null,
);
export default function AdminApp() {
  return <Routes><Route element={<AdminGate />}>{routes}</Route></Routes>;
}
