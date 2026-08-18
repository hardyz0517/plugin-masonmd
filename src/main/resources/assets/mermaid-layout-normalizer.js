(function () {
  "use strict";

  var SVG_SELECTOR = ".bytemd-mermaid > svg";
  var NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:px)?$/i;
  var TRANSLATE_PATTERN = /^translate\(\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(?:\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?))?\s*\)$/i;
  var LEGACY_LABEL_MARKER = "data-plugin-bytemd-legacy-label-repair";
  var LEGACY_STYLE_MARKER = "/* plugin-bytemd legacy Mermaid line repair */";
  var LEGACY_THEME_MARKER = "/* plugin-bytemd Mermaid theme compatibility */";
  var LEGACY_COLOR_PATTERN =
    /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)|\b(?:black|grey|white)\b/gi;
  var LEGACY_PALETTE_PATTERN =
    /#ececff|#9370db|#ffffde|#aaaa33|#333333|#333\b|#e8e8e8|#131300|#000021|#fff5ad|#552222|#f4f4f4|#f0f0f0|#808080|#666\b|hsl\s*\(\s*(?:240|60|80|259\.6261682243)\s*,/i;
  var LEGACY_COLOR_VARIABLES = {
    "#ececff": "var(--bytemd-mermaid-primary-color,#f8f8f8)",
    "#131300": "var(--bytemd-mermaid-primary-text-color,#3b3b3b)",
    "hsl(240,60%,86.2745098039%)":
      "var(--bytemd-mermaid-primary-border-color,#007acc)",
    "#ffffde": "var(--bytemd-mermaid-secondary-color,#f3f3f3)",
    "#000021": "var(--bytemd-mermaid-secondary-text-color,#3b3b3b)",
    "hsl(60,60%,83.5294117647%)":
      "var(--bytemd-mermaid-secondary-border-color,#bdbdbd)",
    "hsl(80,100%,96.2745098039%)":
      "var(--bytemd-mermaid-tertiary-color,#ffffff)",
    "rgb(6.3333333334,0,19.0000000001)":
      "var(--bytemd-mermaid-tertiary-text-color,#3b3b3b)",
    "hsl(80,60%,86.2745098039%)":
      "var(--bytemd-mermaid-tertiary-border-color,#bdbdbd)",
    "#fff5ad": "var(--bytemd-mermaid-note-bkg-color,#fff8c5)",
    "#aaaa33": "var(--bytemd-mermaid-note-border-color,#c8a600)",
    "#333333": "var(--bytemd-mermaid-line-color,#007acc)",
    "#333": "var(--bytemd-mermaid-text-color,#3b3b3b)",
    "#552222": "var(--bytemd-mermaid-error-bkg-color,#fce4e4)",
    "#9370db": "var(--bytemd-mermaid-node-border,#007acc)",
    "#e8e8e8": "var(--bytemd-mermaid-edge-label-background,#ffffff)",
    "hsl(259.6261682243,59.7765363128%,87.9019607843%)":
      "var(--bytemd-mermaid-actor-border,#007acc)",
    "#808080": "var(--bytemd-mermaid-actor-line-color,#6e6e6e)",
    grey: "var(--bytemd-mermaid-actor-line-color,#6e6e6e)",
    black: "var(--bytemd-mermaid-primary-text-color,#3b3b3b)",
    "#666": "var(--bytemd-mermaid-activation-border-color,#6e6e6e)",
    "#f4f4f4": "var(--bytemd-mermaid-activation-bkg-color,#eeeeee)",
    "#f0f0f0": "var(--bytemd-mermaid-alt-background,#f3f3f3)"
  };
  var LEGACY_LINE_STYLE =
    LEGACY_STYLE_MARKER +
    ".marker,.arrowheadPath,.arrowMarkerPath{" +
    "fill:var(--bytemd-mermaid-line-color,#007acc)!important;" +
    "stroke:var(--bytemd-mermaid-line-color,#007acc)!important;}" +
    ".edgePath .path,.flowchart-link{" +
    "stroke:var(--bytemd-mermaid-line-color,#007acc)!important;}" +
    LEGACY_THEME_MARKER;

  function numericDimension(value) {
    if (!value || !NUMBER_PATTERN.test(value.trim())) {
      return undefined;
    }

    var dimension = Number.parseFloat(value);
    return Number.isFinite(dimension) && dimension > 0 ? dimension : undefined;
  }

  function parseViewBox(value) {
    var values = (value || "")
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);

    if (
      values.length !== 4 ||
      !values.every(Number.isFinite) ||
      values[2] <= 0 ||
      values[3] <= 0
    ) {
      return undefined;
    }

    return { width: values[2], height: values[3] };
  }

  function normalizeColorToken(value) {
    return value.toLowerCase().replace(/\s+/g, "");
  }

  function rewriteLegacyStylesheet(stylesheet) {
    return stylesheet.replace(LEGACY_COLOR_PATTERN, function (match) {
      return LEGACY_COLOR_VARIABLES[normalizeColorToken(match)] || match;
    });
  }

  function repairMalformedFallbacks(stylesheet) {
    return stylesheet.replace(/\)\)\)\)333\)/g, ")))))");
  }

  function parseTranslate(value) {
    var match = (value || "").trim().match(TRANSLATE_PATTERN);
    if (!match) {
      return undefined;
    }

    var x = Number(match[1]);
    var y = match[2] === undefined ? 0 : Number(match[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return undefined;
    }

    return { x: x, y: y };
  }

  function formatNumber(value) {
    return String(Number(value.toFixed(6)));
  }

  function numericSvgAttribute(element, name, fallback) {
    var rawValue = element.getAttribute(name);
    if (rawValue === null || rawValue.trim() === "") {
      return fallback;
    }

    var value = Number.parseFloat(rawValue);
    return Number.isFinite(value) ? value : fallback;
  }

  function findSequenceActorRect(text) {
    var parent = text.parentElement;
    while (parent) {
      var rect = parent.querySelector("rect.actor");
      if (rect) {
        return rect;
      }
      parent = parent.parentElement;
    }
    return undefined;
  }

  function normalizeSequenceActorLabels(svg) {
    if (
      (svg.getAttribute("aria-roledescription") || "").toLowerCase() !==
      "sequence"
    ) {
      return;
    }

    svg.querySelectorAll("text.actor").forEach(function (text) {
      // Mermaid stores the actor's x coordinate at the rectangle center, but
      // older SVG output omitted text-anchor and treated it as the left edge.
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");

      var rect = findSequenceActorRect(text);
      if (!rect) {
        return;
      }

      var x = numericSvgAttribute(rect, "x", 0);
      var y = numericSvgAttribute(rect, "y", 0);
      var width = numericSvgAttribute(rect, "width");
      var height = numericSvgAttribute(rect, "height");
      if (
        x === undefined ||
        y === undefined ||
        width === undefined ||
        height === undefined ||
        width <= 0 ||
        height <= 0
      ) {
        return;
      }

      text.setAttribute("x", formatNumber(x + width / 2));
      text.setAttribute("y", formatNumber(y + height / 2));
    });
  }

  function normalizeLegacyText(text, y) {
    if (
      !text ||
      text.hasAttribute("y") ||
      text.hasAttribute("dominant-baseline") ||
      text.hasAttribute(LEGACY_LABEL_MARKER)
    ) {
      return false;
    }

    // Legacy Mermaid placed the text baseline at the top of the label box.
    // Use an explicit geometric baseline so inherited article line-height
    // cannot move it when the saved SVG is embedded in a theme.
    text.setAttribute("y", formatNumber(y));
    text.setAttribute("dominant-baseline", "central");
    text.setAttribute(LEGACY_LABEL_MARKER, "text");
    return true;
  }

  function normalizeLegacyFlowchartLabels(svg) {
    // New Mermaid output uses foreignObject labels and already has its own
    // layout. Only touch the old SVG-only flowchart representation.
    if (svg.querySelector("foreignObject")) {
      return;
    }

    svg.querySelectorAll(".node.flowchart-label > .label").forEach(function (label) {
      var translation = parseTranslate(label.getAttribute("transform"));
      var text = label.querySelector("text");
      if (!translation || translation.y >= 0 || !text) {
        return;
      }

      if (normalizeLegacyText(text, 0)) {
        label.setAttribute(
          "transform",
          "translate(" + formatNumber(translation.x) + ", 0)"
        );
        label.setAttribute(LEGACY_LABEL_MARKER, "node");
      }
    });

    svg.querySelectorAll(".edgeLabel > .label").forEach(function (label) {
      var translation = parseTranslate(label.getAttribute("transform"));
      var text = label.querySelector("text");
      var rect = label.querySelector("rect");
      var height = rect && Number.parseFloat(rect.getAttribute("height"));
      if (
        !translation ||
        translation.y >= 0 ||
        !text ||
        !Number.isFinite(height) ||
        height <= 0
      ) {
        return;
      }

      if (normalizeLegacyText(text, height / 2)) {
        label.setAttribute(LEGACY_LABEL_MARKER, "edge");
      }
    });
  }

  function normalizeSvg(svg) {
    var viewBox = parseViewBox(svg.getAttribute("viewBox"));
    if (!viewBox) {
      return;
    }

    var width = numericDimension(svg.getAttribute("width"));
    var height = numericDimension(svg.getAttribute("height"));

    if (width && !height) {
      height = (width * viewBox.height) / viewBox.width;
    } else if (height && !width) {
      width = (height * viewBox.width) / viewBox.height;
    } else if (!width && !height) {
      width = viewBox.width;
      height = viewBox.height;
    }

    if (width && height) {
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));
      svg.style.setProperty("width", String(width) + "px", "important");
      svg.style.setProperty("height", "auto", "important");
    }

    if (!svg.hasAttribute("preserveAspectRatio")) {
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    }

    normalizeSequenceActorLabels(svg);
    normalizeLegacyFlowchartLabels(svg);

    svg.querySelectorAll("style").forEach(function (style) {
      var stylesheet = style.textContent || "";
      if (stylesheet.includes(LEGACY_THEME_MARKER)) {
        return;
      }

      var hasMalformedFallback = stylesheet.includes("))))333)");
      if (hasMalformedFallback || LEGACY_PALETTE_PATTERN.test(stylesheet)) {
        var normalizedStylesheet = rewriteLegacyStylesheet(
          repairMalformedFallbacks(stylesheet)
        );
        style.textContent = normalizedStylesheet + LEGACY_LINE_STYLE;
      }
    });
  }

  function normalizeDocument() {
    document.querySelectorAll(SVG_SELECTOR).forEach(normalizeSvg);
  }

  normalizeDocument();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", normalizeDocument, { once: true });
  }
})();
