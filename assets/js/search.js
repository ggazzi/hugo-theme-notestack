"use strict";

class SearchController {

  constructor() {
    this.index = null;
    this.pages_by_url = {};

    this.entry_container = document.getElementById("search-results");
    this.entry_template = document.getElementById("template-entry");
    this.tag_template = document.getElementById("template-tag");
  }

  loadSearchIndex() {
    const request = new Request("/index.json", {
      method: "GET",
      headers: {'Accept': 'application/json'},
    });

    return fetch(request)
      .then(response => response.json())
      .then(pages => {
        const pages_by_url = this.pages_by_url = {};
        this.index = lunr(function() {
          this.ref("href");
          this.field("title", {boost: 15});
          this.field("content", {boost: 10});
          this.field("tags", {boost: 20, extractor: p => p.tags.join(' ')});
          for (var page of pages) {
            this.add(page);
            pages_by_url[page.href] = page;
          }
        });
      })
  }

  search(query) {
    const results = this.index.search(query);
    
    this.entry_container.innerHTML = '';
    hideElement("info-search");
    if (results.length == 0) {
      hideElement("info-search-results");
      showElement("error-not-found");
      document.getElementById("error-not-found-query").textContent = query;
    } else {
      hideElement("error-not-found");
      showElement("info-search-results");
      document.getElementById("info-search-results-count").textContent = results.length == 1 ? "one result" : `${results.length} results`;
      document.getElementById("info-search-results-query").textContent = query;
    }

    for (const result of results) {
      const page = this.pages_by_url[result.ref];
      const entry = this.entry_template.content.cloneNode(true);

      const title = entry.querySelector(".template-entry-title");
      title.textContent = page.title;
      title.href = page.href;

      entry.querySelector(".template-entry-summary")
        .textContent = page.short;
      entry.querySelector(".template-entry-lastmod")
        .textContent = page.lastmod;

      const tag_container = entry.querySelector(".template-entry-tags");
      showElement(tag_container, page.tags.length > 0);
      for (const tag of page.tags) {
        const elem = this.tag_template.content.cloneNode(true);
        elem.firstElementChild.textContent = tag;
        tag_container.appendChild(elem);
      }

      this.entry_container.appendChild(entry);
    }
  }
}

function showElement(elemOrId, visible=true) {
  const elem = (typeof elemOrId === 'string') ? 
    document.getElementById(elemOrId) : elemOrId;

  if (visible) {
    elem.classList.remove("d-none");
  } else {
    elem.classList.add("d-none");
  }
}

function hideElement(elemOrId) {
  showElement(elemOrId, false);
}

window.addEventListener('DOMContentLoaded', () => {
  "use strict";
  const search_ctrl = new SearchController();
  search_ctrl.loadSearchIndex()
    .then(() => { showElement("main"); return true})
    .catch(() => { showElement("error-load-index"); return false })
    .finally(() => {
      hideElement("info-loading");
    })
    .then(ok => {
      if (!ok) return;

      const form = document.getElementById("search");
      const input = form.querySelector("#search-input");
      form.addEventListener("submit", event => {
        event.preventDefault();
        const query = input.value.trim();
        if (!query) return;

        const url = new URL(window.location)
        url.searchParams.set('q', query);
        window.history.pushState({ query }, '', url.toString());

        search_ctrl.search(query);
      })

      window.addEventListener('popstate', event => {
        if ('query' in event.state) {
          input.value = event.state.query;
          search_ctrl.search(event.state.query);
        }
      })
    
      const params = new URLSearchParams(window.location.search);
      const query = params.get('q');
      if (query) {
        input.value = query;
        search_ctrl.search(query);
      }
    })

})

