export function uploadTransferScope(userId: number, transfer: unknown) {
  if (!Number.isSafeInteger(userId) || userId < 1 || typeof transfer !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(transfer))
    throw Object.assign(new Error("请重新扫描当前上传二维码"), {status: 400});
  return {user_id: userId, transfer_id: transfer};
}
