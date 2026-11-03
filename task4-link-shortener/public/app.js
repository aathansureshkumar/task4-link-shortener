const form = document.getElementById("shorten-form");
const urlInput = document.getElementById("url");
const aliasInput = document.getElementById("alias");
const formError = document.getElementById("form-error");
const result = document.getElementById("result");
const resultLink = document.getElementById("result-link");
const linksBody = document.getElementById("links-body");
const emptyMsg = document.getElementById("empty");
const analytics = document.getElementById("analytics");

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function copyText(text, button) {
  const done = () => {
    const old = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = old), 1200);
  };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done);
  else done();
}

async function loadLinks() {
  const links = await api("/api/links");
  linksBody.innerHTML = "";
  emptyMsg.classList.toggle("hidden", links.length > 0);

  for (const link of links) {
    const tr = document.createElement("tr");

    const tdShort = document.createElement("td");
    const a = document.createElement("a");
    a.href = link.shortUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = `/${link.code}`;
    tdShort.append(a);

    const tdUrl = document.createElement("td");
    tdUrl.className = "url";
    tdUrl.textContent = link.url;
    tdUrl.title = link.url;

    const tdClicks = document.createElement("td");
    tdClicks.textContent = link.clicks;

    const tdActions = document.createElement("td");
    tdActions.className = "actions";
    const copy = button("Copy", "btn btn-small btn-ghost", () => copyText(link.shortUrl, copy));
    const stats = button("Analytics", "btn btn-small btn-ghost", () => showAnalytics(link.code));
    const del = button("Delete", "btn btn-small btn-ghost btn-danger", async () => {
      await api(`/api/links/${link.code}`, { method: "DELETE" });
      analytics.classList.add("hidden");
      loadLinks();
    });
    tdActions.append(copy, stats, del);

    tr.append(tdShort, tdUrl, tdClicks, tdActions);
    linksBody.append(tr);
  }
}

function button(label, className, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

async function showAnalytics(code) {
  const data = await api(`/api/links/${code}/analytics`);
  document.getElementById("an-code").textContent = `/${data.code}`;
  document.getElementById("an-total").textContent = data.totalClicks;
  document.getElementById("an-last").textContent = data.lastClickedAt ?? "No clicks yet";
  document.getElementById("an-created").textContent = data.createdAt.slice(0, 10);

  const peak = Math.max(1, ...data.lastSevenDays.map((d) => d.clicks));
  const bars = document.getElementById("an-bars");
  bars.innerHTML = "";
  for (const d of data.lastSevenDays) {
    const col = document.createElement("div");
    col.className = "bar";
    const count = document.createElement("b");
    count.textContent = d.clicks;
    const fill = document.createElement("i");
    fill.style.height = `${Math.max(2, (d.clicks / peak) * 100)}px`;
    const day = document.createElement("span");
    day.textContent = d.day.slice(5);
    col.append(count, fill, day);
    bars.append(col);
  }

  const refs = document.getElementById("an-refs");
  refs.innerHTML = "";
  if (data.topReferrers.length === 0) {
    refs.innerHTML = "<li>No clicks yet</li>";
  }
  for (const r of data.topReferrers) {
    const li = document.createElement("li");
    li.innerHTML = "<span></span><b></b>";
    li.firstChild.textContent = r.referrer;
    li.lastChild.textContent = r.clicks;
    refs.append(li);
  }
  analytics.classList.remove("hidden");
  analytics.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.textContent = "";
  try {
    const data = await api("/api/shorten", {
      method: "POST",
      body: JSON.stringify({ url: urlInput.value, alias: aliasInput.value }),
    });
    resultLink.href = data.shortUrl;
    resultLink.textContent = data.shortUrl;
    result.classList.remove("hidden");
    urlInput.value = "";
    aliasInput.value = "";
    loadLinks();
  } catch (err) {
    formError.textContent = err.message;
    result.classList.add("hidden");
  }
});

document.getElementById("copy-result").addEventListener("click", (e) => {
  copyText(resultLink.href, e.currentTarget);
});

loadLinks();
