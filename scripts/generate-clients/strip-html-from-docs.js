// @ts-check
/**
 * Post-processing step that strips HTML tags from JSDoc comments
 * in generated TypeScript model files, converting them to readable
 * plain text suitable for editor hover documentation.
 *
 * See https://github.com/aws/aws-sdk-js-v3/issues/6876
 */
const { readdirSync, readFileSync, writeFileSync, statSync } = require("node:fs");
const { join } = require("node:path");

/**
 * Convert an HTML documentation string to plain text.
 * Handles: <p>, <code>, <a>, <i>, <b>, <ul>, <ol>, <li>,
 *          <note>, <important>, <dl>, <dt>, <dd>, <br>
 * @param {string} html
 * @returns {string}
 */
function htmlToPlainText(html) {
  let text = html;

  // Normalize whitespace within the HTML (collapse runs of spaces/newlines).
  text = text.replace(/\s+/g, " ");

  // <br> / <br/> → newline
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // <a href="URL">text</a> → text (URL)
  text = text.replace(/<a\s+(?:[^>]*?\s+)?href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, url, linkText) => {
    const trimmed = linkText.trim();
    if (trimmed) {
      return `${trimmed} (${url})`;
    }
    return url;
  });

  // <code>...</code> → `...`
  text = text.replace(/<code>([\s\S]*?)<\/code>/gi, "`$1`");

  // <i>...</i> and <b>...</b> → just the content
  text = text.replace(/<\/?[ib]>/gi, "");

  // <note> ... </note> → NOTE: ...
  text = text.replace(/<note>\s*/gi, "\nNOTE: ");
  text = text.replace(/<\/note>/gi, "\n");

  // <important> ... </important> → IMPORTANT: ...
  text = text.replace(/<important>\s*/gi, "\nIMPORTANT: ");
  text = text.replace(/<\/important>/gi, "\n");

  // <dt>...</dt> → term on its own line
  text = text.replace(/<dt>([\s\S]*?)<\/dt>/gi, "\n$1 - ");
  // <dd>...</dd> → definition
  text = text.replace(/<dd>([\s\S]*?)<\/dd>/gi, "$1\n");
  // Remove <dl> wrappers
  text = text.replace(/<\/?dl>/gi, "\n");

  // <li> ... </li> → "  -  ..."
  // Handle <li> with nested <p> tags (common pattern: <li> <p>text</p> </li>)
  text = text.replace(/<li>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/gi, "\n  -  $1");
  // Handle remaining <li>...</li> without nested <p>
  text = text.replace(/<li>([\s\S]*?)<\/li>/gi, "\n  -  $1");

  // Remove <ul>, </ul>, <ol>, </ol> wrappers
  text = text.replace(/<\/?[uo]l>/gi, "");

  // <p>...</p> → paragraph with blank line separation
  text = text.replace(/<p>([\s\S]*?)<\/p>/gi, "\n$1\n");

  // Strip any remaining HTML tags we haven't handled
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");

  // Clean up excessive blank lines (max 2 newlines = 1 blank line)
  text = text.replace(/\n{3,}/g, "\n\n");

  // Clean up trailing spaces on lines
  text = text.replace(/ +\n/g, "\n");

  // Trim leading/trailing whitespace
  text = text.trim();

  return text;
}

/**
 * Process a JSDoc comment block, stripping HTML from the documentation
 * lines while preserving JSDoc tags like @public, @param, etc.
 * @param {string} commentBlock - The full JSDoc comment including delimiters
 * @returns {string}
 */
function processJsDocComment(commentBlock) {
  // Check if this comment contains any HTML tags at all
  if (!/<[a-zA-Z]/.test(commentBlock)) {
    return commentBlock;
  }

  // Extract the body between /** and */
  const match = commentBlock.match(/^(\s*\/\*\*)([\s\S]*?)(\*\/)$/);
  if (!match) {
    return commentBlock;
  }

  const [, , body] = match;

  // Split body into lines and strip comment prefixes
  const lines = body.split("\n");

  // Detect indentation from the closing */ line or from a " * " line
  let indent = "";
  const closerLine = lines[lines.length - 1];
  const closerMatch = closerLine.match(/^(\s*)\*\/$/);
  if (closerMatch) {
    // The closing */ has indent + " ", so base indent is one space less
    indent = closerMatch[1];
  } else {
    // Fallback: detect from a body line like "   * text"
    for (const line of lines) {
      const m = line.match(/^(\s+)\* /);
      if (m) {
        // "   * " means indent is "  " (one less space than the " * " prefix)
        indent = m[1].slice(0, -1);
        break;
      }
    }
  }

  // Reconstruct the raw text content, separating JSDoc tags
  const rawParts = [];
  const jsdocTags = [];

  for (const line of lines) {
    // Remove the leading " * " or "   * " prefix
    const content = line.replace(/^\s*\*\s?/, "").trim();
    if (!content) continue;

    // Check if this is a JSDoc tag line
    if (/^@\w+/.test(content)) {
      jsdocTags.push(content);
    } else {
      rawParts.push(content);
    }
  }

  const rawHtml = rawParts.join(" ").trim();
  if (!rawHtml) {
    return commentBlock;
  }

  // Convert HTML to plain text
  const plainText = htmlToPlainText(rawHtml);

  // Rebuild the comment with proper indentation
  const prefix = `${indent} * `;
  const outputLines = [];
  outputLines.push(`${indent}/**`);

  // Add the converted documentation text
  for (const textLine of plainText.split("\n")) {
    outputLines.push(`${prefix}${textLine}`);
  }

  // Add JSDoc tags
  for (const tag of jsdocTags) {
    outputLines.push(`${prefix}${tag}`);
  }

  outputLines.push(`${indent} */`);

  return outputLines.join("\n");
}

/**
 * Process a TypeScript file, stripping HTML from all JSDoc comments.
 * @param {string} content - File content
 * @returns {string}
 */
function stripHtmlFromFile(content) {
  // Match JSDoc comment blocks with optional leading whitespace: /** ... */
  return content.replace(/([ \t]*)\/\*\*[\s\S]*?\*\//g, (match) => {
    return processJsDocComment(match);
  });
}

/**
 * Recursively process all .ts files in a directory.
 * @param {string} dir
 * @param {{ filesProcessed: number, changed: number }} stats
 */
function processDirectory(dir, stats) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      processDirectory(fullPath, stats);
    } else if (entry.endsWith(".ts")) {
      stats.filesProcessed++;
      const original = readFileSync(fullPath, "utf-8");

      // Quick check: skip files without HTML in comments
      if (!/<[a-zA-Z]/.test(original)) {
        continue;
      }

      const processed = stripHtmlFromFile(original);
      if (processed !== original) {
        writeFileSync(fullPath, processed);
        stats.changed++;
      }
    }
  }
}

/**
 * Strip HTML tags from JSDoc comments in all generated client source files.
 * @param {string} clientsDir - Path to the clients directory
 */
function stripHtmlFromDocs(clientsDir) {
  console.log("Stripping HTML tags from JSDoc comments...");
  const stats = { filesProcessed: 0, changed: 0 };

  for (const clientDir of readdirSync(clientsDir)) {
    const srcDir = join(clientsDir, clientDir, "src");
    try {
      const stat = statSync(srcDir);
      if (stat.isDirectory()) {
        processDirectory(srcDir, stats);
      }
    } catch {
      // src dir doesn't exist, skip
    }
  }

  console.log(`HTML stripping complete: ${stats.filesProcessed} files processed, ${stats.changed} files changed.`);
}

module.exports = { htmlToPlainText, processJsDocComment, stripHtmlFromFile, stripHtmlFromDocs };
