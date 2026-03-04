// Quick test script for strip-html-from-docs.js
const { htmlToPlainText, processJsDocComment, stripHtmlFromFile } = require("./strip-html-from-docs");

let pass = 0;
let fail = 0;

function test(name, actual, expected) {
  if (actual === expected) {
    pass++;
    console.log(`  PASS: ${name}`);
  } else {
    fail++;
    console.log(`  FAIL: ${name}`);
    console.log(`    Expected:\n${indent(expected)}`);
    console.log(`    Actual:\n${indent(actual)}`);
  }
}

function indent(s) {
  return s
    .split("\n")
    .map((l) => `      |${l}`)
    .join("\n");
}

console.log("=== htmlToPlainText ===");

test(
  "simple paragraph",
  htmlToPlainText("<p>The minimum number of accelerators.</p>"),
  "The minimum number of accelerators."
);

test(
  "link",
  htmlToPlainText('<p>See <a href="https://example.com/docs">the docs</a> for info.</p>'),
  "See the docs (https://example.com/docs) for info."
);

test(
  "code",
  htmlToPlainText("<p>Value must be greater than <code>0</code> and less than <code>100</code>.</p>"),
  "Value must be greater than `0` and less than `100`."
);

test(
  "italic and bold",
  htmlToPlainText("<p>See the <i>Amazon ECS Developer Guide</i> and <b>important</b> notes.</p>"),
  "See the Amazon ECS Developer Guide and important notes."
);

test(
  "list",
  htmlToPlainText(
    "<p>Valid values:</p> <ul> <li> <p><code>A</code> - First.</p> </li> <li> <p><code>B</code> - Second.</p> </li> </ul>"
  ),
  "Valid values:\n\n  -  `A` - First.\n  -  `B` - Second."
);

test(
  "note",
  htmlToPlainText("<p>The token value.</p> <note> <p>Treat as opaque.</p> </note>"),
  "The token value.\n\nNOTE:\nTreat as opaque."
);

test(
  "important",
  htmlToPlainText("<p>Do not use this.</p> <important> <p>This is critical.</p> </important>"),
  "Do not use this.\n\nIMPORTANT:\nThis is critical."
);

test(
  "HTML entities",
  htmlToPlainText("<p>Use &amp; for &quot;and&quot; and &lt;tag&gt;.</p>"),
  'Use & for "and" and <tag>.'
);

test(
  "multiple paragraphs",
  htmlToPlainText("<p>First paragraph.</p> <p>Second paragraph.</p>"),
  "First paragraph.\n\nSecond paragraph."
);

console.log("\n=== processJsDocComment ===");

test(
  "top-level JSDoc",
  processJsDocComment(`/**
 * <p>Hello world.</p>
 * @public
 */`),
  `/**
 * Hello world.
 * @public
 */`
);

test(
  "indented JSDoc",
  processJsDocComment(`  /**
   * <p>The ARN of the target group.</p>
   * @public
   */`),
  `  /**
   * The ARN of the target group.
   * @public
   */`
);

test(
  "no HTML passthrough",
  processJsDocComment(`/**
 * Some plain text comment.
 * @public
 */`),
  `/**
 * Some plain text comment.
 * @public
 */`
);

test(
  "complex with link and italic",
  processJsDocComment(`/**
 * <p>The advanced settings. For more info, see <a href="https://docs.aws.amazon.com/example">Required resources</a> in the <i>Amazon ECS Developer Guide</i>.</p>
 * @public
 */`),
  `/**
 * The advanced settings. For more info, see Required resources (https://docs.aws.amazon.com/example) in the Amazon ECS Developer Guide.
 * @public
 */`
);

console.log("\n=== stripHtmlFromFile ===");

const fileInput = `// smithy-typescript generated code
import { DocumentType as __DocumentType } from "@smithy/types";

/**
 * <p>The accelerator count request.</p>
 * @public
 */
export interface AcceleratorCountRequest {
  /**
   * <p>The minimum number of accelerators.</p>
   * @public
   */
  min?: number | undefined;
}
`;

const fileExpected = `// smithy-typescript generated code
import { DocumentType as __DocumentType } from "@smithy/types";

/**
 * The accelerator count request.
 * @public
 */
export interface AcceleratorCountRequest {
  /**
   * The minimum number of accelerators.
   * @public
   */
  min?: number | undefined;
}
`;

test("full file snippet", stripHtmlFromFile(fileInput), fileExpected);

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
