import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { App } from "antd";
import { useTranslation } from "react-i18next";

import { syncServerModels } from "@/xoi/server-models";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const synced = useRef(false);

    // 模型/供应商以 XOi 后台管理员配置为唯一来源：启动即整体同步，本地不再维护渠道
    useEffect(() => {
        if (synced.current) return;
        synced.current = true;
        void syncServerModels().then((hasModels) => {
            if (!hasModels) message.warning(t("config.serverModelsEmpty"));
        });
    }, [message, t]);

    return <>{children}</>;
}
