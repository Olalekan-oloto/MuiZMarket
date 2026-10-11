(() => {
  const host = document.getElementById("socialLinks");
  if (!host) return;
  const labels = { facebook: "Facebook", instagram: "Instagram", twitter: "X / Twitter", tiktok: "TikTok" };
  fetch("/api/config", { credentials: "same-origin" })
    .then(r => r.ok ? r.json() : Promise.reject(new Error("config unavailable")))
    .then(config => {
      const links = config.socialLinks || {};
      Object.entries(labels).forEach(([key, label]) => {
        const raw = links[key];
        if (!raw) return;
        try {
          const url = new URL(raw);
          if (url.protocol !== "https:" && url.protocol !== "http:") return;
          const a = document.createElement("a");
          a.href = url.href; a.textContent = label; a.target = "_blank"; a.rel = "noopener noreferrer";
          host.appendChild(a);
        } catch (_) {}
      });
      if (!host.children.length) host.hidden = true;
    })
    .catch(() => { host.hidden = true; });
})();
