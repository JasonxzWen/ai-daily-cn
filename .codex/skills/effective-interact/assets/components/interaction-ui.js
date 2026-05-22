/* Use case: small local interactions for self-contained Effective reports. The generator inlines this into the final <script> block. */
(function () {
  var sectionFocusTimer = null;
  var lastActiveNavId = "";

  function setCopyButtonState(button, label, state) {
    if (!button) return;
    if (!button.getAttribute("data-copy-label")) {
      button.setAttribute("data-copy-label", button.textContent);
    }
    if (button.getAttribute("data-copy-timer")) {
      clearTimeout(Number(button.getAttribute("data-copy-timer")));
    }
    button.textContent = label;
    button.setAttribute("data-copy-state", state);
    button.setAttribute("aria-live", "polite");
    var timer = setTimeout(function () {
      button.textContent = button.getAttribute("data-copy-label") || label;
      button.removeAttribute("data-copy-state");
      button.removeAttribute("data-copy-timer");
    }, 1100);
    button.setAttribute("data-copy-timer", String(timer));
  }

  function fallbackCopyText(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-1000px";
    area.style.top = "0";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, area.value.length);
    try {
      return document.execCommand("copy");
    } finally {
      document.body.removeChild(area);
    }
  }

  function copyText(text, button) {
    var value = String(text || "").trim();
    if (!value) {
      setCopyButtonState(button, "无内容", "empty");
      return;
    }
    var done = function () {
      setCopyButtonState(button, "已复制", "success");
    };
    var fail = function () {
      setCopyButtonState(button, "复制失败", "failed");
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(done, function () {
        if (fallbackCopyText(value)) done();
        else fail();
      });
      return;
    }

    if (fallbackCopyText(value)) done();
    else fail();
  }

  function copySourceText(source) {
    if (!source) return "";
    if (source.matches("ul, ol")) {
      return Array.prototype.slice.call(source.querySelectorAll("li"))
        .map(function (item) { return "- " + (item.innerText || item.textContent || "").trim(); })
        .filter(Boolean)
        .join("\n");
    }
    return (source.innerText || source.textContent || "").trim();
  }

  function applyFilter(button) {
    var target = button.getAttribute("data-filter-target");
    var value = button.getAttribute("data-filter-value");
    if (!target || !value) return;

    document.querySelectorAll("[data-filter-target='" + target + "']").forEach(function (item) {
      var match = value === "all" || item.getAttribute("data-filter-value") === value;
      item.hidden = !match;
    });

    document.querySelectorAll("button[data-filter-target='" + target + "']").forEach(function (peer) {
      peer.setAttribute("aria-pressed", String(peer === button));
    });

    var field = document.querySelector("[data-focus-field='" + target + "']");
    if (field) {
      field.classList.toggle("has-filter", value !== "all");
    }
  }

  function activateTab(button) {
    var group = button.getAttribute("data-tab-group");
    var panel = button.getAttribute("data-tab");
    if (!group || !panel) return;

    document.querySelectorAll("[data-tab-group='" + group + "'][data-tab]").forEach(function (peer) {
      peer.setAttribute("aria-selected", String(peer === button));
    });

    document.querySelectorAll("[data-tab-panel-group='" + group + "']").forEach(function (item) {
      item.hidden = item.id !== panel;
    });
  }

  function applySearch(input) {
    var target = input.getAttribute("data-search-for");
    var query = input.value.trim().toLowerCase();
    if (!target) return;

    document.querySelectorAll("[data-search-target='" + target + "']").forEach(function (item) {
      item.hidden = Boolean(query) && !item.textContent.toLowerCase().includes(query);
    });
  }

  function updateEvidenceSpotlight(card, event) {
    var rect = card.getBoundingClientRect();
    card.style.setProperty("--spotlight-x", event.clientX - rect.left + "px");
    card.style.setProperty("--spotlight-y", event.clientY - rect.top + "px");
  }

  function clearDataTableHighlight(table) {
    if (!table) return;
    table.removeAttribute("data-hover-row");
    table.removeAttribute("data-hover-column");
    table.querySelectorAll(".table-row-highlight, .table-column-highlight, .table-cell-highlight").forEach(function (cell) {
      cell.classList.remove("table-row-highlight", "table-column-highlight", "table-cell-highlight");
    });
  }

  function applyDataTableHighlight(cell) {
    var table = cell.closest("[data-report-data-table]");
    if (!table) return;
    var row = cell.getAttribute("data-table-row");
    var column = cell.getAttribute("data-table-column");
    clearDataTableHighlight(table);
    if (!row || !column) return;

    table.setAttribute("data-hover-row", row);
    table.setAttribute("data-hover-column", column);

    table.querySelectorAll("[data-table-row='" + row + "']").forEach(function (peer) {
      peer.classList.add("table-row-highlight");
    });
    table.querySelectorAll("[data-table-column='" + column + "']").forEach(function (peer) {
      peer.classList.add("table-column-highlight");
    });
    cell.classList.add("table-cell-highlight");
  }

  function hashTargetId() {
    if (!window.location.hash || window.location.hash === "#") return "";
    var raw = window.location.hash.slice(1);
    try {
      return decodeURIComponent(raw);
    } catch (_) {
      return raw;
    }
  }

  function reportSectionForId(id) {
    if (!id) return null;
    var target = document.getElementById(id);
    if (!target) return null;
    if (target.matches("#report-top, [data-report-region='hero']")) {
      return target;
    }
    if (target.matches("[id][data-section-type], #evidence, #verification, #next-actions")) {
      return target;
    }
    return target.closest("#report-top, [data-report-region='hero'], [id][data-section-type], #evidence, #verification, #next-actions");
  }

  function sectionIsVisible(section) {
    if (!section) return false;
    var rect = section.getBoundingClientRect();
    return rect.bottom > 80 && rect.top < window.innerHeight;
  }

  function highlightTargetSection(id) {
    document.querySelectorAll(".section-focus").forEach(function (section) {
      section.classList.remove("section-focus");
    });
    if (sectionFocusTimer) {
      clearTimeout(sectionFocusTimer);
      sectionFocusTimer = null;
    }

    var section = reportSectionForId(id);
    if (!section) return;
    section.classList.add("section-focus");
    sectionFocusTimer = setTimeout(function () {
      section.classList.remove("section-focus");
      sectionFocusTimer = null;
    }, 1600);
  }

  function updateActiveNavigation() {
    var sections = Array.prototype.slice.call(document.querySelectorAll("#report-top, [id][data-section-type], #evidence, #verification, #next-actions"));
    var hashSection = reportSectionForId(hashTargetId());
    var active = sections
      .map(function (section) {
        var rect = section.getBoundingClientRect();
        return { id: section.id, section: section, top: Math.abs(rect.top - 96), visible: sectionIsVisible(section) };
      })
      .filter(function (item) { return item.visible; })
      .sort(function (a, b) { return a.top - b.top; })[0];
    if (hashSection && sectionIsVisible(hashSection)) {
      active = { id: hashSection.id, section: hashSection, top: 0, visible: true };
    }

    var activeLink = null;
    document.querySelectorAll("[data-nav-link]").forEach(function (link) {
      var isActive = Boolean(active && link.getAttribute("href") === "#" + active.id);
      link.setAttribute("aria-current", isActive ? "true" : "false");
      if (isActive) activeLink = link;
    });

    if (active && active.id !== lastActiveNavId && activeLink && activeLink.scrollIntoView) {
      try {
        activeLink.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch (_) {
        activeLink.scrollIntoView();
      }
    }
    lastActiveNavId = active ? active.id : "";
  }

  document.addEventListener("click", function (event) {
    var navLink = event.target.closest("[data-nav-link]");
    if (navLink) {
      var href = navLink.getAttribute("href") || "";
      if (href.charAt(0) === "#") {
        window.setTimeout(function () {
          highlightTargetSection(hashTargetId());
          updateActiveNavigation();
        }, 80);
      }
    }

    var button = event.target.closest("button");
    if (!button) return;

    if (button.matches("[data-copy-text]")) {
      copyText(button.getAttribute("data-copy-text"), button);
    }

    if (button.matches("[data-copy-from]")) {
      var source = document.querySelector(button.getAttribute("data-copy-from"));
      copyText(source ? (source.content ? source.content.textContent : copySourceText(source)) : "", button);
    }

    if (button.matches("[data-filter-target][data-filter-value]")) {
      applyFilter(button);
    }

    if (button.matches("[data-tab-group][data-tab]")) {
      activateTab(button);
    }
  });

  document.addEventListener("input", function (event) {
    if (event.target.matches("[data-search-for]")) {
      applySearch(event.target);
    }
  });

  document.addEventListener("pointermove", function (event) {
    var card = event.target.closest("[data-evidence-spotlight]");
    if (card) {
      updateEvidenceSpotlight(card, event);
    }
  });

  document.addEventListener("pointerover", function (event) {
    var cell = event.target.closest("[data-table-cell]");
    if (cell) {
      applyDataTableHighlight(cell);
    }
  });

  document.addEventListener("pointerout", function (event) {
    var table = event.target.closest("[data-report-data-table]");
    if (table && !table.contains(event.relatedTarget)) {
      clearDataTableHighlight(table);
    }
  });

  document.addEventListener("focusin", function (event) {
    if (event.target.matches("[data-table-cell]")) {
      applyDataTableHighlight(event.target);
    }
  });

  document.addEventListener("focusout", function (event) {
    var table = event.target.closest("[data-report-data-table]");
    if (table && !table.contains(event.relatedTarget)) {
      clearDataTableHighlight(table);
    }
  });

  document.addEventListener("scroll", updateActiveNavigation, { passive: true });
  window.addEventListener("resize", updateActiveNavigation);
  window.addEventListener("hashchange", function () {
    highlightTargetSection(hashTargetId());
    updateActiveNavigation();
  });
  highlightTargetSection(hashTargetId());
  updateActiveNavigation();
})();
