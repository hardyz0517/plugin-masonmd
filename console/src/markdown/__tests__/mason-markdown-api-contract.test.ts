import { describe, expect, it } from "vitest";
import { getProcessor } from "bytemd";
import { createMarkdownRuntime } from "../pipeline";

describe("Mason Markdown processor integration contract", () => {
  it("accepts the shared sanitizer and remark-rehype options", () => {
    const runtime = createMarkdownRuntime("mason-v1");
    const processor = getProcessor({
      plugins: runtime.plugins,
      sanitize: runtime.sanitize,
      remarkRehype: runtime.remarkRehype,
    });

    const file = processor.processSync("# title\n\ntext");
    expect(file.toString()).toContain("<h1");
  });
});
