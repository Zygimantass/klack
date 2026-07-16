const body = document.body;

const icons = {
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>`,
  file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/></svg>`,
};

const menuButton = document.querySelector("[data-menu-toggle]");
const mobileNav = document.querySelector("[data-mobile-nav]");

function closeMobileNav() {
  mobileNav?.classList.remove("open");
  menuButton?.setAttribute("aria-expanded", "false");
  body.classList.remove("nav-open");
}

menuButton?.addEventListener("click", () => {
  const open = mobileNav?.classList.toggle("open") ?? false;
  menuButton.setAttribute("aria-expanded", String(open));
  body.classList.toggle("nav-open", open);
});

mobileNav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMobileNav));

const docsSidebar = document.querySelector("[data-docs-sidebar]");
const docsToggle = document.querySelector("[data-docs-toggle]");

function closeDocsSidebar() {
  docsSidebar?.classList.remove("open");
  docsToggle?.setAttribute("aria-expanded", "false");
  body.classList.remove("nav-open");
}

docsToggle?.addEventListener("click", () => {
  const open = docsSidebar?.classList.toggle("open") ?? false;
  docsToggle.setAttribute("aria-expanded", String(open));
  body.classList.toggle("nav-open", open);
});

docsSidebar?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeDocsSidebar));

document.addEventListener("click", (event) => {
  if (mobileNav?.classList.contains("open") && !mobileNav.contains(event.target) && !menuButton?.contains(event.target)) {
    closeMobileNav();
  }
  if (docsSidebar?.classList.contains("open") && !docsSidebar.contains(event.target) && !docsToggle?.contains(event.target)) {
    closeDocsSidebar();
  }
});

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const temporary = document.createElement("textarea");
  temporary.value = text;
  temporary.style.position = "fixed";
  temporary.style.opacity = "0";
  document.body.append(temporary);
  temporary.select();
  document.execCommand("copy");
  temporary.remove();
}

document.querySelectorAll("[data-copy]").forEach((button) => {
  const original = button.innerHTML;
  button.addEventListener("click", async () => {
    const target = document.querySelector(button.dataset.copy);
    const text = target?.textContent?.replace(/^\$\s*/, "").trim();
    if (!text) return;

    try {
      await writeClipboard(text);
      button.innerHTML = icons.check;
      button.setAttribute("aria-label", "Copied");
      window.setTimeout(() => {
        button.innerHTML = original;
        button.setAttribute("aria-label", "Copy to clipboard");
      }, 1600);
    } catch {
      button.setAttribute("aria-label", "Copy failed");
    }
  });
});

document.querySelectorAll(".code-frame[data-code]").forEach((frame) => {
  const header = frame.querySelector(".code-header");
  const code = frame.querySelector("code");
  if (!header || !code || header.querySelector(".code-header-copy")) return;

  const button = document.createElement("button");
  button.className = "code-header-copy";
  button.type = "button";
  button.textContent = "Copy";
  button.setAttribute("aria-label", "Copy code");
  button.addEventListener("click", async () => {
    try {
      await writeClipboard(code.textContent.trim());
      button.textContent = "Copied";
      window.setTimeout(() => (button.textContent = "Copy"), 1600);
    } catch {
      button.textContent = "Failed";
    }
  });
  header.append(button);
});

const dialog = document.querySelector("[data-command-dialog]");
const searchInput = dialog?.querySelector("[data-command-input]");
const resultsRoot = dialog?.querySelector("[data-command-results]");
const searchItems = [...document.querySelectorAll("[data-search-item]")].map((element) => ({
  description: element.dataset.searchDescription || "Klack documentation",
  group: element.dataset.searchGroup || "Documentation",
  href: element.getAttribute("href") || "#",
  title: element.dataset.searchTitle || element.textContent.trim(),
}));

let resultLinks = [];
let selectedIndex = 0;

function renderSearch(query = "") {
  if (!resultsRoot) return;
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = searchItems.filter((item) => {
    const haystack = `${item.title} ${item.description} ${item.group}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });

  resultsRoot.replaceChildren();
  resultLinks = [];
  selectedIndex = 0;

  if (matches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "command-empty";
    empty.textContent = `No results for “${query}”`;
    resultsRoot.append(empty);
    return;
  }

  const groups = new Map();
  for (const item of matches) {
    const group = groups.get(item.group) || [];
    group.push(item);
    groups.set(item.group, group);
  }
  for (const [group, items] of groups) {
    const label = document.createElement("div");
    label.className = "command-group-label";
    label.textContent = group;
    resultsRoot.append(label);

    for (const item of items) {
      const link = document.createElement("a");
      link.className = "command-result";
      link.href = item.href;
      link.innerHTML = `<span class="command-result-icon">${icons.file}</span><span class="command-result-text"><strong></strong><span></span></span>`;
      link.querySelector("strong").textContent = item.title;
      link.querySelector(".command-result-text span").textContent = item.description;
      link.addEventListener("click", () => dialog.close());
      resultsRoot.append(link);
      resultLinks.push(link);
    }
  }

  resultLinks[0]?.classList.add("selected");
}

function openSearch() {
  if (!dialog || dialog.open) return;
  closeMobileNav();
  dialog.showModal();
  body.classList.add("dialog-open");
  renderSearch();
  searchInput.value = "";
  window.setTimeout(() => searchInput.focus(), 0);
}

document.querySelectorAll("[data-search-trigger]").forEach((button) => {
  button.addEventListener("click", openSearch);
});

dialog?.addEventListener("close", () => body.classList.remove("dialog-open"));
dialog?.addEventListener("click", (event) => {
  const rect = dialog.getBoundingClientRect();
  const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  if (outside) dialog.close();
});

searchInput?.addEventListener("input", () => renderSearch(searchInput.value));
searchInput?.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
  event.preventDefault();
  if (!resultLinks.length) return;

  if (event.key === "Enter") {
    resultLinks[selectedIndex].click();
    return;
  }

  resultLinks[selectedIndex]?.classList.remove("selected");
  selectedIndex = event.key === "ArrowDown"
    ? (selectedIndex + 1) % resultLinks.length
    : (selectedIndex - 1 + resultLinks.length) % resultLinks.length;
  resultLinks[selectedIndex].classList.add("selected");
  resultLinks[selectedIndex].scrollIntoView({ block: "nearest" });
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    dialog?.open ? dialog.close() : openSearch();
  } else if (event.key === "/" && !typing && !dialog?.open) {
    event.preventDefault();
    openSearch();
  }
});

const observedSections = [...document.querySelectorAll(".docs-section[id]")];
const sectionLinks = [...document.querySelectorAll(".sidebar-link[href^='#'], .toc-link[href^='#']")];

if (observedSections.length && "IntersectionObserver" in window) {
  const activateSection = (id) => {
    sectionLinks.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${id}`));
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) activateSection(visible[0].target.id);
    },
    { rootMargin: "-18% 0px -68%", threshold: [0, 0.05] },
  );
  observedSections.forEach((section) => observer.observe(section));
}

document.querySelectorAll("[data-year]").forEach((element) => {
  element.textContent = String(new Date().getFullYear());
});
