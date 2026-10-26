import test from "node:test";
import assert from "node:assert/strict";
import {safeAssistantMarkup} from "../../../frontend/src/utils/safeAssistantMarkup";
test("assistant text cannot inject image handlers, SVG, scripts or HTML entities",()=>{
  for(const payload of ['<img src=x onerror="stealToken()">','<svg onload="stealToken()"></svg>','```<script>stealToken()</script>```','**<iframe srcdoc="<script>stealToken()</script>">**','&#x3c;img src=x onerror=stealToken()&#x3e;']){
    const html=safeAssistantMarkup(payload);assert.doesNotMatch(html,/<(?:img|svg|script|iframe)\b/i);assert.doesNotMatch(html,/&#x3c;/i);
  }
  assert.equal(safeAssistantMarkup('**标题**\n`代码`'),'<strong>标题</strong><br><code>代码</code>');
});
