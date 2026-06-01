# 扣子工作流：未排版 Word 转精美 HTML（图片内置）

这个目录里的文件用于在扣子 Coze 工作流中搭建一个转换流程：用户上传 `.docx`，工作流输出单文件 HTML，图片以 base64 data URI 内置在 HTML 中。

## 工作流结构

1. **开始节点**
   - 输入参数：`docx_file`
   - 类型：文件
   - 建议限制：只接收 `.docx`

2. **代码节点：ExtractDocx**
   - 语言：Python
   - 代码：复制 `coze_nodes/extract_docx_content.py`
   - 输入映射：
     - `docx_file` = 开始节点的 `docx_file`
   - 输出字段：
     - `title`: String
     - `plain_text`: String
     - `blocks_json`: String
     - `images_json`: String
     - `block_count`: Number
     - `image_count`: Number
     - `error`: String

3. **大模型节点：BeautifyHtmlFragment**
   - 提示词：复制 `coze_nodes/beautify_prompt.md` 里的代码块内容
   - 输入映射：
     - `blocks_json` = `ExtractDocx.blocks_json`
     - `title` = `ExtractDocx.title`
     - `plain_text` = `ExtractDocx.plain_text`
   - 输出字段：
     - `body_html`: String

4. **代码节点：ComposeFinalHtml**
   - 语言：Python
   - 代码：复制 `coze_nodes/compose_final_html.py`
   - 输入映射：
     - `body_html` = `BeautifyHtmlFragment.body_html`
     - `images_json` = `ExtractDocx.images_json`
     - `blocks_json` = `ExtractDocx.blocks_json`
     - `title` = `ExtractDocx.title`
   - 输出字段：
     - `html`: String
     - `filename`: String
     - `preview`: String
     - `error`: String

5. **推荐代码节点：CallUploadHtmlApi**
   - 用途：调用你自己的 `upload-html` 接口，把 `ComposeFinalHtml.html` 存成可下载的 `.html` 文件
   - 服务模板：`upload_service/cloudflare-r2`
   - 代码：复制 `coze_nodes/call_upload_html_api.py`
   - 输入映射：
     - `endpoint` = 你的上传接口地址，例如 `https://files.example.com/upload-html`
     - `token` = 上传接口密钥
     - `html` = `ComposeFinalHtml.html`
     - `filename` = `ComposeFinalHtml.filename`
   - 输出字段：
     - `success`: Boolean
     - `download_url`: String
     - `url`: String
     - `filename`: String
     - `size`: Number
     - `error`: String
     - `status_code`: Number

6. **可选代码节点：UploadHtmlFile**
   - 用途：把 `ComposeFinalHtml.html` 上传到第三方临时文件服务
   - 代码：复制 `coze_nodes/upload_html_file.py`
   - 输入映射：
     - `html` = `ComposeFinalHtml.html`
     - `filename` = `ComposeFinalHtml.filename`
   - 输出字段：
     - `success`: Boolean
     - `url`: String
     - `download_url`: String
     - `service`: String
     - `error`: String

7. **结束节点**
   - 返回：
     - `download_url` = `CallUploadHtmlApi.download_url`
     - `filename` = `ComposeFinalHtml.filename`
   - 如果不想使用外部临时文件服务，也可以直接返回 `html` = `ComposeFinalHtml.html`。

## 网页调用方式

`web_app/` 里提供了一个最小可用网页：

- 用户上传 `.docx`
- 后端调用扣子工作流
- 工作流返回 `html` 和 `filename`
- 浏览器用 `Blob` 自动下载 `.html`

使用网页方式时，建议工作流开始节点增加：

- `docx_base64`: String
- `filename`: String

并把 `ExtractDocx` 的输入映射为：

- `input` = `docx_base64`
- `filename` = `filename`

网页运行说明见 `web_app/README.md`。

## 使用建议

- 这个版本面向 `.docx`。老式 `.doc` 二进制格式建议让用户先另存为 `.docx`，或在工作流前面接一个文档转换服务。
- 图片不会发送给大模型，只会在最终代码节点中内嵌到 HTML，因此能减少上下文消耗。
- 如果文档很长，建议在 `ExtractDocx` 后增加分段循环：每 30 到 50 个 block 调一次大模型，再把片段合并后交给 `ComposeFinalHtml`。
- 如果你只想先验证流程，可以跳过大模型节点，直接把 `ComposeFinalHtml.body_html` 留空；最终节点会用保底排版生成 HTML。
- `CallUploadHtmlApi` 是推荐的正式方案：你控制文件存储、下载域名、权限和有效期。
- `UploadHtmlFile` 使用外部临时文件服务生成下载链接，只适合测试和轻量使用。当前按 Litterbox、Catbox、Gofile、tmpfiles、0x0 的顺序重试。正式业务建议换成自己的 OSS/COS/TOS/S3 或后端上传接口。
