import express from "express";
import initDB from "@/lib/initDB";
import { db } from "@/utils/db";
import { success, error } from "@/lib/responseFormat";
const router = express.Router();

// 清空数据表（仅管理员可用，且需二次确认）
export default router.post(
    "/",
    async (req, res) => {
        const userId = (req as any).user?.id;
        const role = (req as any).user?.role;
        if (!userId) return res.status(401).send(error("未登录"));
        if (role !== "admin") return res.status(403).send(error("仅管理员可操作"));

        const { confirm } = req.body;
        if (confirm !== "DELETE_ALL_DATA") {
            return res.status(400).send(error("请传入 confirm: 'DELETE_ALL_DATA' 以确认清空操作"));
        }

        await initDB(db, true);
        res.status(200).send(success({ message: "清空数据表成功" }));
    },
);
