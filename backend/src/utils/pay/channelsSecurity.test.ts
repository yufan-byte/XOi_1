import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { AlipayChannel } from "./alipay";
import { WechatChannel } from "./wechat";
import { AggrChannel } from "./aggregator";
const keys = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
test("valid signatures cannot substitute a different Alipay application", async () => {
  const channel = new AlipayChannel({
    appId: "our-app",
    publicKey: keys.publicKey,
  });
  for (const app_id of ["our-app", "other-app"]) {
    const body: any = {
      app_id,
      out_trade_no: "fixture-order",
      total_amount: "1.00",
      trade_status: "TRADE_SUCCESS",
      trade_no: "fixture-trade",
    };
    const data = Object.keys(body)
      .sort()
      .map((k) => `${k}=${body[k]}`)
      .join("&");
    body.sign = crypto
      .sign("RSA-SHA256", Buffer.from(data), keys.privateKey)
      .toString("base64");
    const result = await channel.parseAndVerify({ body });
    assert.equal(result.ok, app_id === "our-app");
  }
});
test("Wechat signed/encrypted callbacks bind merchant, application and CNY", async () => {
  const key = "12345678901234567890123456789012",
    nonce = "123456789012";
  const channel = new WechatChannel({
    appId: "our-app",
    mchId: "our-merchant",
    apiV3Key: key,
    platformPublicKeyPem: keys.publicKey,
  });
  for (const wrong of ["none", "appid", "mchid", "currency"]) {
    const inner: any = {
      appid: wrong === "appid" ? "other" : "our-app",
      mchid: wrong === "mchid" ? "other" : "our-merchant",
      trade_state: "SUCCESS",
      out_trade_no: "fixture",
      transaction_id: "fixture-trade",
      amount: { total: 100, currency: wrong === "currency" ? "USD" : "CNY" },
    };
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      Buffer.from(key),
      Buffer.from(nonce),
    );
    cipher.setAAD(Buffer.from("fixture"));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(inner)),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString("base64");
    const body = {
        resource: { ciphertext, nonce, associated_data: "fixture" },
      },
      raw = JSON.stringify(body),
      timestamp = "1791943200",
      headerNonce = "fixture";
    const signature = crypto
      .sign(
        "RSA-SHA256",
        Buffer.from(`${timestamp}\n${headerNonce}\n${raw}\n`),
        keys.privateKey,
      )
      .toString("base64");
    const result = await channel.parseAndVerify({
      body,
      _rawBodyText: raw,
      headers: {
        "wechatpay-timestamp": timestamp,
        "wechatpay-nonce": headerNonce,
        "wechatpay-signature": signature,
      },
    });
    assert.equal(result.ok, wrong === "none");
  }
});
test("aggregator signed callback cannot swap merchant or use an absent secret", async () => {
  for (const mchid of ["ours", "other"]) {
    const body: any = {
      mchid,
      out_trade_no: "fixture",
      total_fee: "100",
      returncode: "success",
      pay_js_order_id: "fixture-trade",
    };
    body.sign = crypto
      .createHash("md5")
      .update(
        Object.keys(body)
          .sort()
          .map((k) => `${k}=${body[k]}`)
          .join("&") + "&key=fixture-secret",
      )
      .digest("hex")
      .toUpperCase();
    assert.equal(
      (
        await new AggrChannel({
          mchid: "ours",
          secret: "fixture-secret",
        }).parseAndVerify({ body })
      ).ok,
      mchid === "ours",
    );
    assert.equal(
      (await new AggrChannel({ mchid: "ours" }).parseAndVerify({ body })).ok,
      false,
    );
  }
});
