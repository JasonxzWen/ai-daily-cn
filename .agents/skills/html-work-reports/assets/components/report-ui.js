/* Use case: small local interactions for self-contained HTML work reports. The generator inlines this into the final <script> block. */
(function () {
  function copyText(text, button) {
    if (!text) return;
    var done = function () {
      if (!button) return;
      var previous = button.textContent;
      button.textContent = "Copied";
      setTimeout(function () {
        button.textContent = previous;
      }, 900);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () {});
      return;
    }

    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      done();
    } finally {
      document.body.removeChild(area);
    }
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

  document.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button) return;

    if (button.matches("[data-copy-text]")) {
      copyText(button.getAttribute("data-copy-text"), button);
    }

    if (button.matches("[data-copy-from]")) {
      var source = document.querySelector(button.getAttribute("data-copy-from"));
      copyText(source ? source.textContent : "", button);
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
})();
