(function () {
  "use strict";

  var INSTALL_MARKER = "__masonMarkdownCodeCopyInstalled";
  var BLOCK_SELECTOR = [
    "pre.mason-code-block",
    "pre.mason-code-fallback",
  ].join(", ");
  var CODE_LINE_SELECTOR = ".mason-code-line";
  var CODE_LINE_CONTENT_SELECTOR = ".mason-code-line-content";
  var CODE_LINE_NUMBER_SELECTOR = ".mason-code-line-number";
  var BUTTON_CLASS = "mason-code-copy-button";
  var BUTTON_SELECTOR = "." + BUTTON_CLASS;
  var BLOCK_MARKER = "data-mason-markdown-code-copy";
  var RESET_DELAY = 1800;

  if (window[INSTALL_MARKER]) {
    return;
  }
  window[INSTALL_MARKER] = true;

  function codeElement(block) {
    return block.querySelector("code");
  }

  function sourceText(block) {
    var code = codeElement(block);
    if (!code) {
      return "";
    }

    var rows = code.querySelectorAll(CODE_LINE_SELECTOR);
    if (!rows.length) {
      return code.textContent || "";
    }

    var lines = [];
    rows.forEach(function (row) {
      var content = row.querySelector(CODE_LINE_CONTENT_SELECTOR);
      if (content) {
        lines.push(content.textContent || "");
        return;
      }

      // A line number is presentation-only and must never enter the clipboard.
      var sourceRow = row.cloneNode(true);
      var lineNumber = sourceRow.querySelector(CODE_LINE_NUMBER_SELECTOR);
      if (lineNumber) {
        lineNumber.remove();
      }
      lines.push(sourceRow.textContent || "");
    });
    return lines.join("\n");
  }

  function installButton(block) {
    if (
      block.hasAttribute(BLOCK_MARKER) ||
      !codeElement(block)
    ) {
      return;
    }

    var button = document.createElement("button");
    button.className = BUTTON_CLASS;
    button.type = "button";
    button.setAttribute("aria-label", "复制代码");
    button.setAttribute("title", "复制代码");

    block.setAttribute(BLOCK_MARKER, "ready");
    block.appendChild(button);
  }

  function installIn(root) {
    if (!root || (root.nodeType !== 1 && root.nodeType !== 9)) {
      return;
    }

    if (root.nodeType === 1 && root.matches(BLOCK_SELECTOR)) {
      installButton(root);
    }
    root.querySelectorAll(BLOCK_SELECTOR).forEach(installButton);
  }

  function fallbackCopy(text) {
    var textarea = document.createElement("textarea");
    var activeElement = document.activeElement;
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.setAttribute("aria-hidden", "true");
    textarea.style.cssText =
      "position:fixed;opacity:0;pointer-events:none;left:-9999px;top:0;";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    try {
      return document.execCommand("copy");
    } catch (_error) {
      return false;
    } finally {
      textarea.remove();
      if (activeElement && typeof activeElement.focus === "function") {
        activeElement.focus();
      }
    }
  }

  function copyText(text) {
    var clipboard = navigator.clipboard;
    if (
      clipboard &&
      typeof clipboard.writeText === "function" &&
      window.isSecureContext !== false
    ) {
      try {
        return clipboard.writeText(text).then(
          function () {
            return true;
          },
          function () {
            return fallbackCopy(text);
          }
        );
      } catch (_error) {
        return Promise.resolve(fallbackCopy(text));
      }
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function showState(button, state) {
    if (button._masonMarkdownCopyTimer) {
      window.clearTimeout(button._masonMarkdownCopyTimer);
    }

    button.disabled = true;
    button.setAttribute("data-copy-state", state);
    button.setAttribute(
      "aria-label",
      state === "success" ? "代码已复制" : "复制代码失败"
    );
    button.setAttribute(
      "title",
      state === "success" ? "代码已复制" : "复制代码失败"
    );
    button._masonMarkdownCopyTimer = window.setTimeout(function () {
      button.disabled = false;
      button.removeAttribute("data-copy-state");
      button.setAttribute("aria-label", "复制代码");
      button.setAttribute("title", "复制代码");
      button._masonMarkdownCopyTimer = undefined;
    }, RESET_DELAY);
  }

  function handleClick(event) {
    var target = event.target;
    var button = target && typeof target.closest === "function"
      ? target.closest(BUTTON_SELECTOR)
      : null;
    if (!button) {
      return;
    }

    var block = button.closest(BLOCK_SELECTOR);
    if (!block) {
      return;
    }

    event.preventDefault();
    copyText(sourceText(block)).then(
      function (copied) {
        showState(button, copied ? "success" : "error");
      },
      function () {
        showState(button, "error");
      }
    );
  }

  function observeCodeBlocks() {
    if (typeof window.MutationObserver !== "function") {
      return;
    }

    new window.MutationObserver(function (records) {
      records.forEach(function (record) {
        record.addedNodes.forEach(function (node) {
          installIn(node);
        });
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  function start() {
    installIn(document);
    document.addEventListener("click", handleClick);
    observeCodeBlocks();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
