/* Use case: bridge pinned Marked, DOMPurify, Mermaid, and highlight.js runtimes for Effective reports. */
(function () {
  var pins = {
    marked: "18.0.3",
    dompurify: "3.4.2",
    mermaid: "11.15.0",
    highlightjs: "11.11.1"
  };

  function query(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  function statusNode(id) {
    return id ? document.querySelector("[data-rich-status='" + id + "']") : null;
  }

  function setSectionState(section, state, text) {
    if (!section) return;
    section.dataset.renderState = state;
    section.setAttribute("data-section-status", state);
    var pill = section.querySelector(".section-heading .status-pill");
    if (pill) {
      pill.textContent = statusLabel(state);
      pill.className = "status-pill " + statusClass(state);
    }
    if (text) {
      section.dataset.renderMessage = text;
    }
  }

  function statusClass(state) {
    if (state === "ready") return "status-ok";
    if (state === "failed" || state === "error") return "status-danger";
    if (state === "degraded" || state === "pending" || state === "fallback") return "status-warn";
    return "status-info";
  }

  function statusLabel(state) {
    var labels = {
      ready: "就绪",
      failed: "失败",
      error: "失败",
      degraded: "降级",
      pending: "待处理",
      fallback: "降级",
      "not-runtime": "非运行时"
    };
    return labels[state] || state;
  }

  function readTextSource(node) {
    if (!node) return "";
    return node.content ? node.content.textContent : node.textContent;
  }

  function setStatus(id, state, text) {
    var node = statusNode(id);
    if (!node) return;
    node.dataset.state = state;
    node.textContent = text;
  }

  function setDependencyState(id, state) {
    var card = document.querySelector("[data-runtime-dependency='" + id + "']");
    if (!card) return;
    card.dataset.runtimeDependencyState = state;
    var pill = card.querySelector(".status-pill");
    if (pill) {
      pill.textContent = statusLabel(state);
      pill.className = "status-pill " + statusClass(state);
    }
  }

  function applyReportMarkSyntax(source) {
    return String(source || "").replace(/==([^=\n]+)==/g, '<mark class="text-highlight">$1</mark>');
  }

  function updatePageRuntimeState() {
    var richSections = query("[data-rich-section]");
    var states = richSections.map(function (section) {
      return section.dataset.renderState || "pending";
    });
    var state = "ready";
    if (states.some(function (item) { return item === "failed"; })) state = "failed";
    else if (states.some(function (item) { return item === "degraded"; })) state = "degraded";
    else if (states.some(function (item) { return item === "pending"; })) state = "pending";

    document.documentElement.dataset.runtimeState = state;
    var label = document.querySelector("[data-runtime-state-label]");
    if (label) label.textContent = statusLabel(state);
    var pill = document.querySelector("[data-runtime-state-pill]");
    if (pill) {
      pill.textContent = statusLabel(state);
      pill.className = "status-pill " + statusClass(state);
    }
    document.dispatchEvent(new CustomEvent("html-work-report-runtime-state", { detail: { state: state } }));
    return state;
  }

  function renderMarkdown() {
    var parser = window.marked;
    var purifier = window.DOMPurify;
    var count = 0;

    if (parser && typeof parser.parse === "function") setDependencyState("marked", "ready");
    else setDependencyState("marked", "failed");
    if (purifier && typeof purifier.sanitize === "function") setDependencyState("dompurify", "ready");
    else setDependencyState("dompurify", "failed");

    query("[data-rich-markdown]").forEach(function (node) {
      var section = node.closest("[data-rich-section]");
      var statusId = node.getAttribute("data-rich-status-id") || "markdown";
      var trusted = node.getAttribute("data-trusted") === "true";
      var source = node.textContent.trim();

      if (node.dataset.rendered === "true") {
        count += 1;
        return;
      }

      if (!parser || typeof parser.parse !== "function") {
        setStatus(statusId, "degraded", "Markdown runtime unavailable");
        setSectionState(section, "degraded", "Markdown runtime unavailable");
        return;
      }

      if (!purifier && !trusted) {
        setStatus(statusId, "failed", "Markdown sanitizer missing");
        setSectionState(section, "failed", "Markdown sanitizer missing");
        return;
      }

      try {
        var html = parser.parse(applyReportMarkSyntax(source));
        node.innerHTML = purifier ? purifier.sanitize(html) : html;
        node.classList.add("rendered-markdown");
        node.dataset.rendered = "true";
        setStatus(statusId, "ready", "ready");
        setSectionState(section, "ready", "ready");
        count += 1;
      } catch (error) {
        setStatus(statusId, "failed", "Markdown render failed");
        setSectionState(section, "failed", error.message);
      }
    });

    updatePageRuntimeState();
    return count;
  }

  async function renderMermaid() {
    if (!window.mermaid) {
      setDependencyState("mermaid", "failed");
      query("[data-rich-mermaid-target]").forEach(function (target) {
        var section = target.closest("[data-rich-section]");
        var statusId = target.getAttribute("data-rich-status-id");
        target.dataset.renderState = "degraded";
        target.textContent = "Mermaid 运行时不可用，已保留隐藏源内容。";
        setStatus(statusId, "degraded", "Mermaid runtime missing");
        setSectionState(section, "degraded", "Mermaid runtime missing");
      });
      updatePageRuntimeState();
      return 0;
    }

    setDependencyState("mermaid", "ready");
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      fontFamily: "Inter, system-ui, sans-serif",
      flowchart: {
        htmlLabels: false,
        curve: "basis",
        wrappingWidth: 180
      },
      sequence: {
        diagramMarginX: 24,
        diagramMarginY: 18,
        actorMargin: 44,
        width: 140,
        height: 58
      }
    });

    var count = 0;
    for (var index = 0; index < query("[data-rich-mermaid-target]").length; index += 1) {
      var target = query("[data-rich-mermaid-target]")[index];
      var section = target.closest("[data-rich-section]");
      var statusId = target.getAttribute("data-rich-status-id");
      var sourceId = target.getAttribute("data-source-id");
      var source = sourceId ? document.getElementById(sourceId) : null;
      var text = source ? readTextSource(source) : target.textContent;
      var diagramId = "mermaid-diagram-" + index + "-" + Math.random().toString(16).slice(2);

      if (target.dataset.renderState === "ready") {
        count += 1;
        continue;
      }

      try {
        var result = await window.mermaid.render(diagramId, text.trim());
        target.innerHTML = result.svg;
        target.dataset.renderState = "ready";
        setStatus(statusId, "ready", "ready");
        setSectionState(section, "ready", "ready");
        count += 1;
      } catch (error) {
        target.textContent = "Mermaid 渲染失败，已保留隐藏源内容。";
        target.dataset.renderState = "failed";
        setStatus(statusId, "failed", "Mermaid render failed");
        setSectionState(section, "failed", error.message);
      }
    }

    updatePageRuntimeState();
    return count;
  }

  function wrapHighlightedLines(html, source, startLine, highlightLines) {
    var htmlLines = String(html || "").split("\n");
    var sourceLines = String(source || "").replace(/\r\n/g, "\n").split("\n");
    var hot = new Set(highlightLines);
    return sourceLines.map(function (_line, index) {
      var lineNumber = startLine + index;
      var relative = index + 1;
      var cls = hot.has(lineNumber) || hot.has(relative) ? "line-hot" : "code-line";
      var rendered = htmlLines[index] || "";
      return '<span class="' + cls + '" data-line="' + lineNumber + '">' + rendered + "</span>";
    }).join("");
  }

  function parseHighlightLines(value) {
    return String(value || "")
      .split(",")
      .map(function (item) { return Number(item.trim()); })
      .filter(function (item) { return Number.isFinite(item); });
  }

  function escapeFallbackHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function stashToken(tokens, html, pattern, renderToken) {
    return html.replace(pattern, function () {
      var args = Array.prototype.slice.call(arguments);
      var match = args[0];
      var key = "\u0000EFFECTIVE_HL_" + tokens.length + "\u0000";
      tokens.push(typeof renderToken === "function"
        ? renderToken.apply(null, args)
        : '<span class="' + renderToken + '">' + match + "</span>");
      return key;
    });
  }

  function restoreTokens(tokens, html) {
    return html.replace(/\u0000EFFECTIVE_HL_(\d+)\u0000/g, function (_match, index) {
      return tokens[Number(index)] || "";
    });
  }

  function fallbackHighlightLine(line, language) {
    var lang = String(language || "").toLowerCase();
    var tokens = [];
    var html = escapeFallbackHtml(line);
    html = stashToken(tokens, html, /(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|`[^`]*?`)/g, "hljs-string");
    if (["bash", "sh", "shell", "powershell", "ps1"].includes(lang)) {
      html = stashToken(tokens, html, /(^|\s)(#.*)$/g, function (_match, prefix, comment) {
        return prefix + '<span class="hljs-comment">' + comment + "</span>";
      });
      html = stashToken(tokens, html, /(--?[A-Za-z][A-Za-z0-9-]*)/g, "hljs-attr");
      html = stashToken(tokens, html, /\b(bun|node|npm|pnpm|yarn|git|gh|openspec|powershell|pwsh|cd|dir|ls|rg|curl|docker)\b/g, "hljs-built_in");
      return restoreTokens(tokens, html);
    }

    html = stashToken(tokens, html, /(\/\/.*)$/g, "hljs-comment");
    html = stashToken(tokens, html, /\b(class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g, function (_match, keyword, name) {
      return '<span class="hljs-keyword">' + keyword + '</span> <span class="hljs-title class_">' + name + "</span>";
    });
    html = stashToken(tokens, html, /\b(function|def)\s+([A-Za-z_$][\w$]*)/g, function (_match, keyword, name) {
      return '<span class="hljs-keyword">' + keyword + '</span> <span class="hljs-title function_">' + name + "</span>";
    });
    html = stashToken(tokens, html, /\b(async|await|const|let|var|return|function|export|import|from|if|else|try|catch|new|typeof|instanceof|extends|implements|public|private|protected|static|readonly|yield|switch|case|break|continue|throw|throws|for|while|do|in|of)\b/g, "hljs-keyword");
    html = stashToken(tokens, html, /\b(string|number|boolean|unknown|never|void|object|Record|Promise|Array|Map|Set)\b/g, "hljs-type");
    html = stashToken(tokens, html, /\b(true|false|null|undefined|NaN|Infinity)\b/g, "hljs-literal");
    html = stashToken(tokens, html, /\b(\d+(?:\.\d+)?)\b/g, "hljs-number");
    html = stashToken(tokens, html, /([A-Za-z_$][\w$]*)(\s*:)/g, function (_match, name, colon) {
      return '<span class="hljs-attr">' + name + "</span>" + colon;
    });
    return restoreTokens(tokens, html);
  }

  function fallbackHighlightCode(source, language) {
    return String(source || "").replace(/\r\n/g, "\n").split("\n")
      .map(function (line) { return fallbackHighlightLine(line, language); })
      .join("\n");
  }

  function hasHighlightTokens(html) {
    return /\bclass=(?:"|')hljs-/.test(String(html || ""));
  }

  function highlightCode() {
    if (!window.hljs || typeof window.hljs.highlight !== "function") {
      setDependencyState("highlightjs", "failed");
      query("[data-rich-code]").forEach(function (node) {
        var section = node.closest("[data-rich-section]");
        var statusId = node.getAttribute("data-rich-status-id");
        setStatus(statusId, "degraded", "Highlighter unavailable");
        setSectionState(section, "degraded", "Highlighter unavailable");
      });
      updatePageRuntimeState();
      return 0;
    }

    setDependencyState("highlightjs", "ready");
    var count = 0;
    query("[data-rich-code]").forEach(function (node) {
      var section = node.closest("[data-rich-section]");
      var statusId = node.getAttribute("data-rich-status-id");
      var sourceId = node.getAttribute("data-code-source-id");
      var sourceNode = sourceId ? document.getElementById(sourceId) : null;
      var source = sourceNode ? readTextSource(sourceNode) : node.textContent;
      var languageClass = Array.prototype.find.call(node.classList, function (cls) {
        return cls.indexOf("language-") === 0;
      });
      var language = languageClass ? languageClass.replace("language-", "") : "plaintext";
      var startLine = Number(node.getAttribute("data-start-line") || "1");
      var highlightLines = parseHighlightLines(node.getAttribute("data-highlight-lines"));

      if (node.dataset.highlighted === "true") {
        count += 1;
        return;
      }

      try {
        var temp = document.createElement("code");
        temp.className = "language-" + language;
        temp.textContent = source;
        if (typeof window.hljs.highlightElement === "function") {
          window.hljs.highlightElement(temp);
        }
        var highlighted = temp.innerHTML || (window.hljs.getLanguage(language)
          ? window.hljs.highlight(source, { language: language, ignoreIllegals: true }).value
          : window.hljs.highlightAuto(source).value);
        if (!hasHighlightTokens(highlighted)) {
          highlighted = fallbackHighlightCode(source, language);
        }
        node.innerHTML = wrapHighlightedLines(highlighted, source, startLine, highlightLines);
        node.dataset.highlighted = "true";
        setStatus(statusId, "ready", "ready");
        setSectionState(section, "ready", "ready");
        count += 1;
      } catch (error) {
        setStatus(statusId, "failed", "Code highlight failed");
        setSectionState(section, "failed", error.message);
      }
    });

    updatePageRuntimeState();
    return count;
  }

  async function renderAll() {
    renderMarkdown();
    await renderMermaid();
    highlightCode();
    updatePageRuntimeState();
  }

  window.HTMLWorkReportsRichRender = {
    pins: pins,
    renderAll: renderAll,
    renderMarkdown: renderMarkdown,
    renderMermaid: renderMermaid,
    highlightCode: highlightCode
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderAll);
  } else {
    renderAll();
  }

  window.addEventListener("rich-render-libs-ready", renderAll);
})();
