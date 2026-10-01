import express from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import { maskInputs, isSecretInput } from "@/utils/vendorSecurity";
const router = express.Router();

export default router.post("/", async (req, res) => {
  const data = await u.db("o_vendorConfig").select("*");

  const list = (
    await Promise.all(
      data.map(async (item) => {
        const vendor = u.vendor.getVendor(item.id!);
        if (!vendor) {
          return null
        };
        return {
          ...item,
          inputValues: maskInputs(JSON.parse(item.inputValues ?? "{}"), vendor.inputs),
          credentialsConfigured: Object.entries(JSON.parse(item.inputValues ?? "{}")).some(([key, value]) => value && isSecretInput(key, vendor.inputs)),
          models: await u.vendor.getModelList(item.id!),
          code: process.env.NODE_ENV === "prod" || process.env.NODE_ENV === "production" ? "" : u.vendor.getCode(item.id!),
          description: vendor.description ?? "",
          inputs: vendor.inputs,
          author: vendor.author,
          name: vendor.name,
          version: vendor.version ?? "1.0",
        };
      }),
    )
  ).filter((i) => Boolean(i));

  list.sort((a, b) => (a!.id === "xoi" ? -1 : b!.id === "xoi" ? 1 : 0));
  res.status(200).send(success(list));
});
