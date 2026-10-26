import { config,MdEditor,MdPreview } from "md-editor-v3";
import {safeMarkdownHtml} from "./safeMarkdownHtml";
// The library defaults to identity sanitization. All site imports use this boundary.
for(const component of [MdEditor,MdPreview]){
  const props=(component as unknown as {props:{sanitize:{default:(html:string)=>string}}}).props;
  props.sanitize.default=safeMarkdownHtml;
}
export { MdEditor, MdPreview };
// Configure links only when a markdown view is actually loaded.
  config({
    markdownItConfig(md) {
      // 自定义链接渲染
      const defaultRender =
        md.renderer.rules.link_open ||
        function (tokens, idx, options, env, self) {
          return self.renderToken(tokens, idx, options);
        };
      md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
        const token = tokens[idx];
        const href = token.attrGet("href");

        if (href) {
          // 添加 target="_blank" 在新窗口打开
          token.attrSet("target", "_blank");
          token.attrSet("rel", "noopener noreferrer");

          // 或者添加自定义点击事件的标识
          token.attrSet("data-link", href);
          token.attrSet("onclick", "return handleLinkClick(event)");
        }

        return defaultRender(tokens, idx, options, env, self);
      };
    },
  });

