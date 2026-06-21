(function () {
  const REPO = {
    owner: "Daxiknia",
    name: "AboutZhouYu",
    branch: "master",
  };

  const CODE_PREFIX = "[0]code/";
  const DEFAULT_IGNORE_PATHS = ["[0]资料/0推荐书目"];
  const SKIP_FILES = new Set([".gitignore", ".nojekyll", "index.html"]);
  const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);
  const EXTENSIONS = new Set([
    "txt", "md", "html", "htm", "mht", "mhtml", "doc", "docx", "pdf", "epub",
    "jpg", "jpeg", "png", "azw3", "mobi", "caj", "kml", "rar"
  ]);

  const els = {
    summary: document.getElementById("summary"),
    query: document.getElementById("queryInput"),
    tag: document.getElementById("tagFilter"),
    excludeTag: document.getElementById("excludeTagFilter"),
    author: document.getElementById("authorFilter"),
    kind: document.getElementById("kindFilter"),
    zeroData: document.getElementById("zeroDataFilter"),
    tagSuggestions: document.getElementById("tagSuggestions"),
    excludeTagSuggestions: document.getElementById("excludeTagSuggestions"),
    authorSuggestions: document.getElementById("authorSuggestions"),
    kindSuggestions: document.getElementById("kindSuggestions"),
    topTags: document.getElementById("topTags"),
    results: document.getElementById("results"),
    count: document.getElementById("resultCount"),
    status: document.getElementById("sourceStatus"),
    sort: document.getElementById("sortSelect"),
    sortButton: document.getElementById("sortButton"),
    sortMenu: document.getElementById("sortMenu"),
    zeroDataButton: document.getElementById("zeroDataButton"),
    zeroDataMenu: document.getElementById("zeroDataMenu"),
    clear: document.getElementById("clearBtn"),
  };

  const state = { query: "", tag: "", excludeTag: "", author: "", kind: "", zeroData: "normal", sort: "score" };
  const data = { files: [], tags: [], authors: [], kinds: [], ignorePaths: DEFAULT_IGNORE_PATHS };
  const fmt = new Intl.NumberFormat("zh-CN");

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, "");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
    }[ch]));
  }

  function encodePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function pagesHref(path) {
    if (location.hostname.endsWith("github.io")) {
      const repoFromPath = location.pathname.split("/").filter(Boolean)[0] || REPO.name;
      return `/${repoFromPath}/${encodePath(path)}`;
    }
    return `../../${encodePath(path)}`;
  }

  function fileName(path) {
    return path.split("/").pop() || path;
  }

  function extension(path) {
    const name = fileName(path);
    const index = name.lastIndexOf(".");
    return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
  }

  function dirName(path) {
    const index = path.lastIndexOf("/");
    return index >= 0 ? path.slice(0, index) : "";
  }

  function baseDirName(path) {
    return fileName(dirName(path));
  }

  function isIgnored(path) {
    const normalizedPath = path.replace(/\\/g, "/");
    return data.ignorePaths.some((raw) => {
      const rule = raw.trim().replace(/\\/g, "/").replace(/\/+$/, "");
      if (!rule || rule.startsWith("#")) return false;
      return normalizedPath === rule || normalizedPath.startsWith(`${rule}/`);
    });
  }

  function isZeroDataPath(path) {
    return path === "[0]资料" || path.startsWith("[0]资料/");
  }

  function titleFromPath(path) {
    const stem = fileName(path).replace(/\.[^.]+$/, "");
    return stem.trim() || fileName(path);
  }

  function parsedTitleFromPath(path) {
    const stem = fileName(path).replace(/\.[^.]+$/, "");
    const pair = titleAuthorFromStem(stem);
    const title = pair.title.replace(/^\s*(?:\[[^\[\]]+\])+/, "").replace(/\s+by\s+.+$/i, "").trim();
    return title || stem;
  }

  function titleAuthorFromStem(stem) {
    const cleaned = stem.trim();
    const looksLikeNumberedFile = /^_?\d+_/.test(cleaned);
    if (looksLikeNumberedFile || !cleaned.includes("_")) return { title: cleaned, author: "" };

    const parts = cleaned.split("_").map((part) => part.trim()).filter(Boolean);
    const authors = [];
    while (parts.length > 1 && authors.length < 3) {
      const candidate = parts[parts.length - 1];
      const looksLikeAuthor = /^[\u3400-\u9fffA-Za-z·. -]{2,12}$/.test(candidate) && /[\u3400-\u9fffA-Za-z]/.test(candidate);
      if (!looksLikeAuthor) break;
      authors.unshift(parts.pop());
    }

    const title = parts.join("_").trim();
    if (!title || !authors.length) return { title: cleaned, author: "" };
    return { title, author: authors.join("、") };
  }

  function tagsFromName(name) {
    const tags = [];
    const re = /\[([^\[\]]+)\]/g;
    let match;
    while ((match = re.exec(name))) {
      match[1].split(/[、,/|，]+/).forEach((raw) => {
        const tag = raw.trim();
        if (tag && !tags.includes(tag)) tags.push(tag);
      });
    }
    return tags;
  }

  function authorFromPath(path) {
    const parts = path.split("/");
    for (const part of parts.slice(0, -1)) {
      if (part.startsWith("作者：")) return part.slice(3).trim();
    }
    const stem = fileName(path).replace(/\.[^.]+$/, "");
    const pair = titleAuthorFromStem(stem);
    if (pair.author) return pair.author;
    const patterns = [/\s+by\s+(.+)$/i, /by\s*([^（(]+)$/i, /作者[：:]\s*(.+)$/];
    for (const pattern of patterns) {
      const match = stem.match(pattern);
      if (match) return match[1].split(/[（(]/)[0].trim();
    }
    return "";
  }

  function pathSearchText(item) {
    return [item.name, item.path, item.children ? item.children.map((child) => child.path).join(" ") : ""].join(" ");
  }

  function groupKeyFromEntry(entry) {
    const stem = fileName(entry.path).replace(/\.[^.]+$/, "").trim();
    const parsed = parsedTitleFromPath(entry.path)
      .replace(/^\s*(?:\[[^\[\]]+\])+/, "")
      .replace(/\s+by\s+.+$/i, "")
      .trim();
    const source = parsed || stem;
    const key = normalize(source
      .replace(/^[（(]?\d+[）)]\s*/, "")
      .replace(/\s*[（(]?\d+[）)]?\s*$/g, "")
      .replace(/\s+\d+$/g, "")
      .replace(/\d+\s*by\s*/i, "by ")
      .replace(/[._-]+$/g, ""));
    return key || "__numeric__";
  }

  function kindFromExt(ext) {
    if (["jpg", "jpeg", "png"].includes(ext)) return "image";
    if (["txt", "md"].includes(ext)) return "text";
    if (["html", "htm", "mht", "mhtml"].includes(ext)) return "html";
    if (["doc", "docx"].includes(ext)) return "word";
    if (["epub", "azw3", "mobi"].includes(ext)) return "ebook";
    if (ext === "pdf") return "pdf";
    if (ext === "rar") return "archive";
    return ext || "file";
  }

  function compactKind(item) {
    if (item.fileCount > 1) return "合集";
    return item.ext || item.kind || "file";
  }

  function fileSize(bytes) {
    if (!Number.isFinite(bytes)) return "未知大小";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function countPairs(items) {
    const counts = new Map();
    items.forEach((name) => {
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts, ([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
  }

  function shouldGroupEntries(entries, groupKey) {
    if (entries.length < 2) return false;
    const directory = dirName(entries[0].path);
    const leaf = fileName(directory);
    if (!leaf || /^\[?\d+\]?资料$/.test(leaf) || leaf.startsWith("[0]")) return false;
    if (/^作者[：:]/.test(leaf)) return false;
    if (groupKey === "__numeric__" && /相关|资料|合集|目录|汇总|整理|图包/.test(leaf)) return false;
    return entries.every((entry) => IMAGE_EXTENSIONS.has(extension(entry.path))) || entries.length >= 3;
  }

  function itemFromEntry(entry) {
    const ext = extension(entry.path);
    const name = fileName(entry.path);
    const tags = tagsFromName(name);
    const author = authorFromPath(entry.path);
    return {
      title: titleFromPath(entry.path),
      name,
      path: entry.path,
      href: pagesHref(entry.path),
      tags,
      author,
      kind: kindFromExt(ext),
      ext,
      size: entry.size || 0,
      sha: entry.sha,
      fileCount: 1,
    };
  }

  function itemFromGroup(entries) {
    const first = entries[0];
    const directory = dirName(first.path);
    const leaf = fileName(directory);
    const tags = tagsFromName(leaf).concat(entries.flatMap((entry) => tagsFromName(fileName(entry.path))))
      .filter((tag, index, list) => tag && list.indexOf(tag) === index);
    const author = authorFromPath(`${directory}/${leaf}`);
    return {
      title: titleFromPath(`${directory}/${leaf}`),
      name: leaf,
      path: `${directory}/（${entries.length} 个文件）`,
      href: pagesHref(first.path),
      tags,
      author,
      kind: "collection",
      ext: "合集",
      size: entries.reduce((sum, entry) => sum + (entry.size || 0), 0),
      sha: first.sha,
      fileCount: entries.length,
      children: entries,
    };
  }

  function buildData(tree) {
    const entries = tree
      .filter((entry) => entry.type === "blob")
      .filter((entry) => !entry.path.startsWith(CODE_PREFIX))
      .filter((entry) => !isIgnored(entry.path))
      .filter((entry) => !SKIP_FILES.has(fileName(entry.path)))
      .filter((entry) => EXTENSIONS.has(extension(entry.path)));

    const byDirAndKey = new Map();
    entries.forEach((entry) => {
      const groupKey = groupKeyFromEntry(entry);
      const key = `${dirName(entry.path)}\n${groupKey}`;
      if (!byDirAndKey.has(key)) byDirAndKey.set(key, { groupKey, entries: [] });
      byDirAndKey.get(key).entries.push(entry);
    });

    const files = [];
    byDirAndKey.forEach(({ groupKey, entries: group }) => {
      if (shouldGroupEntries(group, groupKey)) {
        files.push(itemFromGroup(group));
      } else {
        group.forEach((entry) => files.push(itemFromEntry(entry)));
      }
    });

    data.files = files;
    data.tags = countPairs(files.flatMap((item) => item.tags));
    data.authors = countPairs(files.map((item) => item.author).filter(Boolean));
    data.kinds = countPairs(files.map((item) => item.kind));
  }

  function suggestionButton(item) {
    const suffix = item.count === undefined ? "" : `<span>${fmt.format(item.count)}</span>`;
    return `<button class="suggestion-item" type="button" data-value="${escapeHtml(item.name)}">${escapeHtml(item.name)}${suffix}</button>`;
  }

  function renderSuggestions(input, panel, list) {
    const query = normalize(input.value);
    const matches = list
      .filter((item) => !query || normalize(item.name).includes(query))
      .slice(0, 18);
    panel.innerHTML = matches.length
      ? matches.map(suggestionButton).join("")
      : `<div class="suggestion-item">没有匹配项</div>`;
    panel.classList.toggle("open", document.activeElement === input);
  }

  function includesFilter(value, filter) {
    if (!filter) return true;
    return normalize(value).includes(normalize(filter));
  }

  function hasTagFilter(tags, filter) {
    if (!filter) return true;
    return tags.some((tag) => includesFilter(tag, filter));
  }

  function scoreItem(item, rawQuery) {
    const query = normalize(rawQuery);
    if (!query) return 1;
    const haystack = normalize([item.title, item.author, item.tags.join(" "), pathSearchText(item)].join(" "));
    const direct = haystack.indexOf(query);
    if (direct >= 0) return 1200 - direct;
    let pos = -1;
    let score = 0;
    for (const ch of query) {
      const found = haystack.indexOf(ch, pos + 1);
      if (found < 0) return 0;
      score += found === pos + 1 ? 9 : 3;
      pos = found;
    }
    return score;
  }

  function highlight(text) {
    const query = state.query.trim();
    if (!query) return escapeHtml(text);
    const chars = Array.from(new Set(Array.from(query).filter((ch) => ch.trim())));
    if (!chars.length) return escapeHtml(text);
    const pattern = new RegExp(`(${chars.map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    return escapeHtml(text).replace(pattern, "<mark>$1</mark>");
  }

  function filtered() {
    return data.files
      .map((item) => ({ item, score: scoreItem(item, state.query) }))
      .filter(({ item, score }) => {
        if (!score) return false;
        if (!hasTagFilter(item.tags, state.tag)) return false;
        if (state.excludeTag && hasTagFilter(item.tags, state.excludeTag)) return false;
        if (!includesFilter(item.author, state.author)) return false;
        if (!includesFilter(item.kind, state.kind)) return false;
        if (state.zeroData === "only" && !isZeroDataPath(item.path)) return false;
        if (state.zeroData === "exclude" && isZeroDataPath(item.path)) return false;
        return true;
      })
      .sort((a, b) => {
        if (state.sort === "title") return a.item.title.localeCompare(b.item.title, "zh-CN");
        if (state.sort === "author") return (a.item.author || "zz").localeCompare(b.item.author || "zz", "zh-CN");
        if (state.sort === "size") return b.item.size - a.item.size;
        if (state.sort === "path") return a.item.path.localeCompare(b.item.path, "zh-CN");
        return b.score - a.score || a.item.title.localeCompare(b.item.title, "zh-CN");
      });
  }

  function renderTopTags() {
    els.topTags.innerHTML = data.tags.slice(0, 30).map((tag) => {
      const active = state.tag === tag.name ? " active" : "";
      return `<button class="chip${active}" type="button" data-tag="${escapeHtml(tag.name)}">${escapeHtml(tag.name)}<span>${fmt.format(tag.count)}</span></button>`;
    }).join("");
  }

  function render() {
    const rows = filtered();
    els.count.textContent = `${fmt.format(rows.length)} / ${fmt.format(data.files.length)} 个条目`;
    if (!rows.length) {
      els.results.innerHTML = `<div class="empty-card">没有匹配结果</div>`;
      renderTopTags();
      return;
    }
    els.results.innerHTML = rows.map(({ item }) => {
      const tags = item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
      const author = item.author ? `<span>作者：${escapeHtml(item.author)}</span>` : "<span>作者未识别</span>";
      const fileType = compactKind(item);
      const count = item.fileCount > 1 ? `<span>${fmt.format(item.fileCount)} 个文件</span>` : "";
      return `
        <article class="result-card">
          <div class="kind-mark">${escapeHtml(fileType)}</div>
          <div class="result-main">
            <a class="result-title" href="${item.href}" target="_blank" rel="noreferrer" title="${escapeHtml(item.path)}">${highlight(item.title)}</a>
            <div class="meta">${author}<span>${fileSize(item.size)}</span>${count}</div>
            ${tags ? `<div class="tag-list">${tags}</div>` : ""}
          </div>
        </article>
      `;
    }).join("");
    renderTopTags();
  }

  function syncFromControls() {
    state.query = els.query.value;
    state.tag = els.tag.value;
    state.excludeTag = els.excludeTag.value;
    state.author = els.author.value;
    state.kind = els.kind.value;
    state.zeroData = els.zeroData.value;
    state.sort = els.sort.value;
    render();
  }

  function menuLabel(menu, value) {
    const item = Array.from(menu.querySelectorAll("[data-value]"))
      .find((option) => option.dataset.value === value);
    return item ? item.textContent.trim() : "";
  }

  function setMenuValue(input, button, menu, value) {
    input.value = value;
    button.textContent = menuLabel(menu, value) || button.textContent;
    menu.querySelectorAll("[data-value]").forEach((item) => {
      item.classList.toggle("active", item.dataset.value === value);
    });
  }

  function closeMenus() {
    [els.sortMenu, els.zeroDataMenu].forEach((menu) => {
      menu.classList.remove("open");
    });
    [els.sortButton, els.zeroDataButton].forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
  }

  function wireMenu(input, button, menu) {
    setMenuValue(input, button, menu, input.value);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const willOpen = !menu.classList.contains("open");
      closeMenus();
      menu.classList.toggle("open", willOpen);
      button.setAttribute("aria-expanded", String(willOpen));
    });
    menu.addEventListener("mousedown", (event) => {
      const item = event.target.closest("[data-value]");
      if (!item) return;
      event.preventDefault();
      setMenuValue(input, button, menu, item.dataset.value);
      closeMenus();
      syncFromControls();
      button.focus();
    });
  }

  function wireControls() {
    [els.query, els.tag, els.excludeTag, els.author, els.kind, els.zeroData, els.sort].forEach((el) => el.addEventListener("input", syncFromControls));
    [
      { input: els.tag, panel: els.tagSuggestions, list: () => data.tags },
      { input: els.excludeTag, panel: els.excludeTagSuggestions, list: () => data.tags },
      { input: els.author, panel: els.authorSuggestions, list: () => data.authors },
      { input: els.kind, panel: els.kindSuggestions, list: () => data.kinds },
    ].forEach(({ input, panel, list }) => {
      input.addEventListener("input", () => renderSuggestions(input, panel, list()));
      input.addEventListener("focus", () => renderSuggestions(input, panel, list()));
      panel.addEventListener("mousedown", (event) => {
        const button = event.target.closest("[data-value]");
        if (!button) return;
        event.preventDefault();
        input.value = button.dataset.value;
        panel.classList.remove("open");
        syncFromControls();
      });
    });
    wireMenu(els.zeroData, els.zeroDataButton, els.zeroDataMenu);
    wireMenu(els.sort, els.sortButton, els.sortMenu);
    document.addEventListener("mousedown", (event) => {
      [els.tagSuggestions, els.excludeTagSuggestions, els.authorSuggestions, els.kindSuggestions].forEach((panel) => {
        if (!panel.parentElement.contains(event.target)) panel.classList.remove("open");
      });
      if (!event.target.closest(".menu-wrap")) closeMenus();
    });
    document.querySelectorAll("[data-clear]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = document.getElementById(button.dataset.clear);
        if (!target) return;
        const value = button.dataset.default || "";
        target.value = value;
        if (target === els.zeroData) setMenuValue(els.zeroData, els.zeroDataButton, els.zeroDataMenu, value);
        syncFromControls();
        const focusTarget = button.dataset.focus ? document.getElementById(button.dataset.focus) : target;
        if (focusTarget) focusTarget.focus();
      });
    });
    els.clear.addEventListener("click", () => {
      els.query.value = "";
      els.tag.value = "";
      els.excludeTag.value = "";
      els.author.value = "";
      els.kind.value = "";
      els.zeroData.value = "normal";
      els.sort.value = "score";
      setMenuValue(els.zeroData, els.zeroDataButton, els.zeroDataMenu, "normal");
      setMenuValue(els.sort, els.sortButton, els.sortMenu, "score");
      syncFromControls();
      els.query.focus();
    });
    els.topTags.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tag]");
      if (!button) return;
      els.tag.value = state.tag === button.dataset.tag ? "" : button.dataset.tag;
      syncFromControls();
    });
  }

  function loadIgnorePaths() {
    if (Array.isArray(window.SITE_IGNORE_PATHS)) {
      data.ignorePaths = Array.from(new Set(DEFAULT_IGNORE_PATHS.concat(window.SITE_IGNORE_PATHS)));
    }
  }

  async function loadFromGitHub() {
    const url = `https://api.github.com/repos/${REPO.owner}/${REPO.name}/git/trees/${REPO.branch}?recursive=1`;
    els.status.textContent = `读取 ${REPO.owner}/${REPO.name}@${REPO.branch}`;
    const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`GitHub API ${response.status}`);
    const payload = await response.json();
    if (payload.truncated) {
      els.status.textContent = "仓库文件树过大，GitHub 返回了截断结果";
    } else {
      els.status.textContent = "已直接同步 GitHub 仓库文件树";
    }
    buildData(payload.tree || []);
  }

  async function init() {
    wireControls();
    try {
      loadIgnorePaths();
      await loadFromGitHub();
      els.summary.textContent = `${REPO.name}：${fmt.format(data.files.length)} 个条目，${fmt.format(data.tags.length)} 个标签，${fmt.format(data.authors.length)} 位作者`;
      render();
    } catch (error) {
      els.summary.textContent = "暂时无法读取 GitHub 仓库";
      els.status.textContent = error.message;
      els.count.textContent = "加载失败";
      els.results.innerHTML = `<div class="empty-card">GitHub 文件树读取失败。确认仓库已公开，或稍后刷新页面。</div>`;
    }
  }

  init();
}());
