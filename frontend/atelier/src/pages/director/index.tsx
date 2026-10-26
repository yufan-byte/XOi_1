import { useEffect } from "react";

// 统一从宿主的按账号分桶的导演台入口管理工程，不再打开无 owner 的公共场景。
export default function DirectorPage() {
    useEffect(() => {
        (window.top ?? window).location.href = "/#/director3d";
    }, []);
    return (
        <main className="grid h-full place-content-center bg-[#faf9f7] text-[#34302d]">正在打开导演工作台…</main>
    );
}
