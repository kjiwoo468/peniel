/* ============================================================
   Peniel — Shared Script (v2)
   ============================================================ */
const HQ = (() => {
  const JOURNAL_KEY   = "hq_journal";
  const PROGRESS_KEY  = "hq_progress";

  function loadJournal()  { try { return JSON.parse(localStorage.getItem(JOURNAL_KEY))  || {}; } catch(e) { return {}; } }
  function saveJournal(d) { try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(d)); } catch(e) {} }
  function loadProgress() { try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; } catch(e) { return {}; } }
  function saveProgress(d){ try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(d)); } catch(e) {} }

  function markRead(id, idx) {
    const p = loadProgress();
    if (!p[id]) p[id] = { furthest: 0 };
    if (idx > (p[id].furthest || 0)) p[id].furthest = idx;
    saveProgress(p);
  }
  function getProgress(id) { return loadProgress()[id] || { furthest: 0 }; }

  /* ---- Step-through navigation ---- */
  function initPage(pageId) {
    const stage = document.getElementById("screenStage");
    if (!stage) return;
    const screens = Array.from(stage.querySelectorAll(".screen"));
    const total   = screens.length;
    const track   = document.getElementById("navTrack");
    const label   = document.getElementById("navLabel");
    const fill    = document.getElementById("progressFill");
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");

    const dots = [];
    screens.forEach((screen, i) => {
      if (i > 0) { const l = document.createElement("div"); l.className="nav-line"; track.appendChild(l); }
      const step = document.createElement("div"); step.className = "nav-step";
      const dot  = document.createElement("button"); dot.type="button"; dot.className="nav-dot";
      dot.textContent = String(i+1);
      dot.setAttribute("aria-label","Go to: "+(screen.dataset.title||"Section "+(i+1)));
      dot.addEventListener("click", () => showScreen(i));
      step.appendChild(dot); track.appendChild(step); dots.push(dot);
    });

    const saved = getProgress(pageId);
    let current = Math.min(saved.furthest||0, total-1);

    function renderNav(scroll) {
      const furthest = Math.max(getProgress(pageId).furthest||0, current);
      dots.forEach((dot,idx) => {
        dot.classList.toggle("is-active", idx===current);
        dot.classList.toggle("is-done",   idx<=furthest && idx!==current);
      });
      fill.style.width = (total>1 ? (current/(total-1))*100 : 100)+"%";
      const title = screens[current].dataset.title||"";
      label.innerHTML = "Section <span>"+(current+1)+" of "+total+"</span>"+(title?" \u2014 "+title:"");
      prevBtn.disabled = current===0;
      nextBtn.disabled = current===total-1;
      nextBtn.textContent = current===total-1 ? "End of topic" : "Next \u2192";
      if (scroll) dots[current].scrollIntoView({behavior:"smooth",inline:"center",block:"nearest"});
    }

    function showScreen(i) {
      current = Math.max(0, Math.min(i, total-1));
      screens.forEach((s,idx) => s.hidden = idx!==current);
      if (current > (getProgress(pageId).furthest||0)) markRead(pageId, current);
      renderNav(true);
      window.scrollTo({top:stage.offsetTop-90, behavior:"smooth"});
    }

    prevBtn.addEventListener("click", ()=>showScreen(current-1));
    nextBtn.addEventListener("click", ()=>showScreen(current+1));
    document.addEventListener("keydown", e=>{
      const tag=(e.target.tagName||"").toLowerCase();
      if(tag==="textarea"||tag==="input") return;
      if(e.key==="ArrowRight"&&!nextBtn.disabled) showScreen(current+1);
      if(e.key==="ArrowLeft" &&!prevBtn.disabled)  showScreen(current-1);
    });

    screens.forEach((s,idx)=>s.hidden=idx!==current);
    renderNav(false);
  }

  /* ---- Journal ---- */
  function initJournal() {
    const saved = loadJournal();
    document.querySelectorAll("textarea[data-key]").forEach(ta=>{
      if(saved[ta.dataset.key]) ta.value = saved[ta.dataset.key];
      const note = ta.closest(".journal-wrap")?.querySelector(".save-note");
      let timer;
      ta.addEventListener("input", ()=>{
        clearTimeout(timer);
        timer = setTimeout(()=>{
          const all = loadJournal(); all[ta.dataset.key]=ta.value; saveJournal(all);
          if(note){note.classList.add("is-visible"); note.textContent="Saved";}
        },500);
      });
    });
  }

  /* ---- Accordions ---- */
  function initAccordions() {
    document.querySelectorAll(".accordion-trigger").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const item = btn.closest(".accordion-item");
        item.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", item.classList.contains("is-open"));
      });
    });
  }

  /* ---- Index progress ---- */
  function initIndex() {
    document.querySelectorAll("[data-progress-id]").forEach(el=>{
      const id    = el.dataset.progressId;
      const total = parseInt(el.dataset.total||"5",10);
      const prog  = getProgress(id);
      const dot   = el.querySelector(".progress-dot");
      if(!dot) return;
      if(prog.furthest>=total-1) { dot.textContent="✓ Read"; dot.className="progress-dot is-done"; }
      else if(prog.furthest>0)   { dot.textContent="In progress"; dot.className="progress-dot is-prog"; }
    });

    initNews();

    const clearBtn=document.getElementById("clearProgress");
    if(clearBtn) clearBtn.addEventListener("click",()=>{
      if(confirm("Clear all saved journal entries and reading progress on this device?")) {
        localStorage.removeItem(JOURNAL_KEY);
        localStorage.removeItem(PROGRESS_KEY);
        location.reload();
      }
    });
  }

  const NEWS_FEED_URL = "https://api.rss2json.com/v1/api.json?rss_url=https://www.christianpost.com/rss";

  function sanitizeText(html) {
    const temp = document.createElement("div");
    temp.innerHTML = html || "";
    return (temp.textContent || temp.innerText || "").trim().replace(/\s+/g, " ");
  }

  function summarizeText(text, maxChars = 320) {
    if (!text) return "";
    const sentences = text.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length >= 2) {
      return sentences.slice(0, 2).join(" ").trim();
    }
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars).trim().replace(/\s+\S*$/, "") + "…";
  }

  async function fetchKJV(passage) {
    if (!passage) return null;
    try {
      const url = 'https://bible-api.com/' + encodeURIComponent(passage) + '?translation=kjv';
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const data = await resp.json();
      return (data.text || data.translation && data.translation.text) || null;
    } catch (e) { return null; }
  }

  async function fetchWikiSummary(title) {
    if (!title) return null;
    try {
      const safe = encodeURIComponent(String(title).replace(/ & /g, ' and '));
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${safe}`;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.extract || null;
    } catch (e) { return null; }
  }

  function setNewsMessage(message, isError = false) {
    const container = document.getElementById("newsSummary");
    if (!container) return;
    container.innerHTML = `<div class="news-summary__empty${isError ? " is-error" : ""}">${message}</div>`;
  }

  async function loadNewsSummary() {
    const button = document.getElementById("newsButton");
    const originalLabel = button ? button.textContent : "Loading...";
    if (button) {
      button.disabled = true;
      button.textContent = "Loading...";
    }

    setNewsMessage("Loading the latest Christian news…");

    try {
      const response = await fetch(NEWS_FEED_URL);
      if (!response.ok) throw new Error("News request failed: " + response.status);
      const feed = await response.json();
      if (feed && feed.items && feed.items.length) {
        renderNewsSummary(feed.items);
      } else {
        throw new Error('No items in primary feed');
      }
    } catch (error) {
      console.warn("Primary news fetch failed, trying RSS fallback", error);
      // fallback: fetch raw RSS via AllOrigins and parse
      try {
        const rssUrl = 'https://www.christianpost.com/rss';
        const allUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(rssUrl);
        const r2 = await fetch(allUrl);
        if (!r2.ok) throw new Error('Fallback fetch failed');
        const xml = await r2.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');
        const items = Array.from(doc.querySelectorAll('item')).slice(0,5).map(it=>({
          title: it.querySelector('title')?.textContent || '',
          link: it.querySelector('link')?.textContent || '',
          pubDate: it.querySelector('pubDate')?.textContent || '',
          author: it.querySelector('author')?.textContent || '',
          description: it.querySelector('description')?.textContent || it.querySelector('content\:encoded')?.textContent || ''
        }));
        if (items && items.length) renderNewsSummary(items);
        else throw new Error('No items in fallback feed');
      } catch (err2) {
        console.error('News load failed', error, err2);
        setNewsMessage('Could not load the latest news. Please try again later.', true);
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    }
  }

  function renderNewsSummary(items) {
    const primary = items[0];
    const container = document.getElementById("newsSummary");
    if (!container) return;
    container.innerHTML = "";

    const card = document.createElement("article");
    card.className = "news-summary__card";

    const header = document.createElement("div");
    header.className = "news-summary__header";

    const titleWrap = document.createElement("div");
    const title = document.createElement("h2");
    title.id = "news-summary-heading";
    title.textContent = "Latest Christian News";
    const meta = document.createElement("p");
    meta.className = "news-summary__meta";
    meta.textContent = `${new Date(primary.pubDate || Date.now()).toLocaleDateString()} · ${primary.author || "Christian news feed"}`;
    titleWrap.append(title, meta);

    const readLink = document.createElement("a");
    readLink.className = "btn btn--ghost";
    readLink.href = primary.link || "#";
    readLink.target = "_blank";
    readLink.rel = "noopener";
    readLink.textContent = "Read the full story";

    header.append(titleWrap, readLink);

    const storyTitle = document.createElement("h3");
    storyTitle.textContent = primary.title || "Latest Christian news";

    const summary = document.createElement("p");
    summary.textContent = summarizeText(sanitizeText(primary.description || primary.content || ""));

    card.append(header, storyTitle, summary);

    if (items.length > 1) {
      const listWrap = document.createElement("div");
      listWrap.className = "news-summary__list-wrap";
      const listIntro = document.createElement("p");
      listIntro.textContent = "More headlines:";
      const list = document.createElement("ul");
      list.className = "news-summary__list";
      items.slice(1, 3).forEach(item => {
        const listItem = document.createElement("li");
        const link = document.createElement("a");
        link.href = item.link || "#";
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = item.title || "More news";
        listItem.appendChild(link);
        list.appendChild(listItem);
      });
      listWrap.append(listIntro, list);
      card.appendChild(listWrap);
    }

    container.appendChild(card);
  }

  function initNews() {
    const button = document.getElementById("newsButton");
    if (!button) return;
    button.addEventListener("click", loadNewsSummary);
  }




  function initDevotionalGenerator() {
    const select = document.getElementById("devotionalTopic");
    const generateButton = document.getElementById("generateDevotional");
    const saveButton = document.getElementById("saveDevotional");
    if (!select || !generateButton || !saveButton) return;

    DEVOTIONAL_TOPIC_OPTIONS.forEach(opt => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      select.appendChild(option);
    });

    const draft = loadDevotionalDraft();
    if (draft && draft.topicKey) {
      select.value = draft.topicKey;
      document.getElementById("devotionalLength").value = String(draft.length || 7);
      renderDevotionalPlan(draft.topicKey, draft.length || 7, true);
      saveButton.disabled = false;
      hideSavePrompt();
    }

    generateButton.addEventListener("click", async () => {
      const topicKey = select.value || DEVOTIONAL_TOPIC_OPTIONS[0].value;
      const length = parseInt(document.getElementById("devotionalLength").value, 10) || 7;
      await renderDevotionalPlan(topicKey, length);
      saveButton.disabled = false;
      hideSavePrompt();
    });

    saveButton.addEventListener("click", handleSaveDevotional);

    // Quick devotional links removed (user request): per-topic buttons are no longer injected here.
  }

  async function renderDevotionalPlan(topicKey, length, autoLoad = false) {
    // If user chose LLM generation, delegate to server endpoint
    try {
      const useLLM = document.getElementById('useLLM')?.checked;
      if (useLLM) {
        await renderDevotionalFromLLM(topicKey, length);
        saveDevotionalDraft({ topicKey, length, updatedAt: Date.now() });
        return;
      }
    } catch (e) {
      // fall back to local generation
    }
    const topicOpt = DEVOTIONAL_TOPIC_OPTIONS.find(o=>o.value===topicKey) || DEVOTIONAL_TOPIC_OPTIONS[0];
    const detail = pickTopicDetail(topicKey);
    const output = document.getElementById("devotionalOutput");
    if (!output) return;
    output.innerHTML = "";

    // Try to fetch a topic-level summary (wiki) and scripture text (KJV)
    const wikiPromise = fetchWikiSummary(topicOpt.label);
    const kjvPromise = fetchKJV(detail.scripture);

    const draft = loadDevotionalDraft();
    for (let day = 1; day <= length; day++) {
      const card = document.createElement("article");
      card.className = "devotional-day-card";

      const heading = document.createElement("h3");
      heading.textContent = `Day ${day}: ${DEVOTIONAL_DAY_PROMPTS[(day - 1) % DEVOTIONAL_DAY_PROMPTS.length]}`;

      const scripture = document.createElement("p");
      scripture.innerHTML = `<strong>Scripture:</strong> ${detail.scripture}`;

      const evidence = document.createElement("p");
      evidence.innerHTML = `<strong>Extra-biblical evidence:</strong> ${detail.evidence}`;

      const viewpoints = document.createElement("div");
      // Elaborate each common viewpoint with a short, topic-aware explanation
      const explainViewpoint = (vp) => {
        // Prefer explicit viewpointDetails when available
        if (detail.viewpointDetails && detail.viewpointDetails[vp]) {
          return `<strong>${vp}:</strong> ${detail.viewpointDetails[vp]}`;
        }
        // derive a short phrase from the viewpoint label
        const cleaned = String(vp).replace(/[-_]/g, ' ').replace(/\s+/g,' ').trim();
        const firstEvidencePhrase = (detail.evidence || '').split(/[.,;]\s*/)[0] || detail.scripture || '';
        return `<strong>${vp}:</strong> This perspective emphasizes ${cleaned.toLowerCase()}. Proponents often appeal to ${firstEvidencePhrase}${firstEvidencePhrase && detail.scripture ? ' and ' + detail.scripture : detail.scripture ? ' ('+detail.scripture+')' : ''}.`;
      };
      viewpoints.innerHTML = `<strong>Common viewpoints:</strong><br><br>` + detail.viewpoints.map(explainViewpoint).join('<br><br>');

      const reflectionLabel = document.createElement("label");
      reflectionLabel.htmlFor = `devotional-notes-${topicKey}-${day}`;
      reflectionLabel.textContent = "Your thoughts";

      const reflection = document.createElement("textarea");
      reflection.id = `devotional-notes-${topicKey}-${day}`;
      reflection.placeholder = "Write your observations, questions, or prayers here.";
      // restore saved reflection if present
      if (draft && draft.reflections && draft.topicKey===topicKey && draft.reflections[String(day)]) {
        reflection.value = draft.reflections[String(day)];
      }

      // autosave reflections on input (debounced)
      let tmr;
      reflection.addEventListener('input', ()=>{
        clearTimeout(tmr);
        tmr = setTimeout(()=>{
          const d = loadDevotionalDraft() || { topicKey, length };
          d.topicKey = topicKey; d.length = length; d.updatedAt = Date.now();
          d.reflections = d.reflections || {};
          d.reflections[String(day)] = reflection.value;
          saveDevotionalDraft(d);
        }, 600);
      });

      card.append(heading, scripture, evidence, viewpoints, reflectionLabel, reflection);
      output.appendChild(card);
    }

    // Await fetches and then update the first day's scripture/evidence if available
    try {
      const [wiki, kjvText] = await Promise.all([wikiPromise, kjvPromise]);
      if (kjvText) {
        const firstScript = output.querySelector('.devotional-day-card p');
        if (firstScript) firstScript.innerHTML = `<strong>Scripture:</strong> ${detail.scripture} — <em>${sanitizeText(kjvText)}</em>`;
      }
      if (wiki) {
        const firstEvidence = output.querySelector('.devotional-day-card p + p');
        if (firstEvidence) {
          const expanded = `${sanitizeText(detail.evidence || '')} — ${summarizeText(sanitizeText(wiki), 420)}`;
          firstEvidence.innerHTML = `<strong>Extra-biblical evidence:</strong> ${expanded}`;
          // Also enhance the common viewpoints block to include the wiki context
          const vpBlock = output.querySelector('.devotional-day-card + .devotional-day-card, .devotional-day-card');
          const vpEl = output.querySelector('.devotional-day-card div');
          if (vpEl) {
            // append a small note linking the wiki summary to the viewpoints
            vpEl.innerHTML = vpEl.innerHTML + `<p style="margin-top:.6rem;color:var(--ink-soft);font-size:.92rem"><em>Context note:</em> ${summarizeText(sanitizeText(wiki), 220)}</p>`;
          }
        }
      }
    } catch (e) {
      // ignore network errors and keep local detail text
    }

    const note = document.createElement("p");
    note.style.color = "var(--ink-soft)";
    note.style.fontSize = "0.92rem";
    note.style.marginTop = "1rem";
    note.textContent = `This devotional guide is generated from topic-based study prompts and may include references to public discussion sources. Use it as a starting place for your own reflection.`;
    output.appendChild(note);

    saveDevotionalDraft({ topicKey, length, updatedAt: Date.now() });
    if (!autoLoad) hideSavePrompt();
  }

  // LLM-backed rendering: request the server to generate a structured devotional JSON.
  async function renderDevotionalFromLLM(topicKey, length) {
    const output = document.getElementById('devotionalOutput');
    if (!output) return;
    output.innerHTML = '<p style="color:var(--ink-soft)">Generating devotional via LLM…</p>';
    try {
      const topicOpt = DEVOTIONAL_TOPIC_OPTIONS.find(o=>o.value===topicKey) || DEVOTIONAL_TOPIC_OPTIONS[0];
      const resp = await fetch('/api/generate-devotional', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topicOpt.label, topicKey, length })
      });
      if (!resp.ok) throw new Error('LLM request failed: ' + resp.status);
      const data = await resp.json();
      // Expect data.days = [{ day:1, heading, scripture, evidence, viewpoints:[{title,detail}], reflectionPrompt }]
      if (!data || !Array.isArray(data.days)) throw new Error('Malformed LLM response');
      output.innerHTML = '';
      data.days.forEach(d => {
        const card = document.createElement('article'); card.className='devotional-day-card';
        const h = document.createElement('h3'); h.textContent = d.heading || `Day ${d.day}`;
        const s = document.createElement('p'); s.innerHTML = `<strong>Scripture:</strong> ${d.scripture || ''}`;
        const e = document.createElement('p'); e.innerHTML = `<strong>Extra-biblical evidence:</strong> ${d.evidence || ''}`;
        const v = document.createElement('div'); v.innerHTML = `<strong>Common viewpoints:</strong><br><br>` + (d.viewpoints||[]).map(vp=>`<strong>${vp.title}:</strong> ${vp.detail}`).join('<br><br>');
        const reflLabel = document.createElement('label'); reflLabel.textContent = 'Your thoughts';
        const refl = document.createElement('textarea'); refl.id = `devotional-notes-${topicKey}-${d.day}`; refl.placeholder = 'Write your observations, questions, or prayers here.';
        // restore draft if any
        const draft = loadDevotionalDraft();
        if (draft && draft.reflections && draft.reflections[String(d.day)]) refl.value = draft.reflections[String(d.day)];
        // autosave
        let t; refl.addEventListener('input', ()=>{ clearTimeout(t); t=setTimeout(()=>{ const D = loadDevotionalDraft()||{topicKey,length}; D.topicKey=topicKey; D.length=length; D.reflections=D.reflections||{}; D.reflections[String(d.day)] = refl.value; saveDevotionalDraft(D); }, 600); });
        card.append(h,s,e,v,reflLabel,refl); output.appendChild(card);
      });
      const note = document.createElement('p'); note.style.color='var(--ink-soft)'; note.style.marginTop='1rem'; note.textContent = 'Generated by an LLM — verify citations and use as starting point.'; output.appendChild(note);
    } catch (e) {
      output.innerHTML = `<div class="news-summary__empty is-error">LLM generation failed: ${e.message}</div>`;
      console.error(e);
      // Rethrow so callers (renderDevotionalPlan) can detect failure and fall back to local generator
      throw e;
    }
  }

  return { initPage, initJournal, initAccordions, initIndex };
})();
