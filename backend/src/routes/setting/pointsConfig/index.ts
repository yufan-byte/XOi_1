import express from "express";
import balance from "./balance";
import log from "./log";
import adminAllocate from "./adminAllocate";
import adminUsers from "./adminUsers";
import purchase from "./purchase";
import prices from "./prices";
import member from "./member";
import dashboard from "./dashboard";

const router = express.Router();

// 用户接口
router.use("/", balance);
router.use("/", log);
router.use("/", purchase);
router.use("/", member);

// 管理员接口
router.use("/admin", adminAllocate);
router.use("/admin", adminUsers);
router.use("/admin", prices);
router.use("/admin", dashboard);

export default router;
