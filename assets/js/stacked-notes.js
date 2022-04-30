class StackedNotesController {

  constructor(notes_container) {
    this.container = notes_container;
    this.notes = [];

    for (const note of notes_container.children) {
      if ([...note.classList].includes('note') && 'href' in note.dataset) {
        this.notes.push(note.dataset.href);

        let level = this.notes.length
        note.dataset.level = level;
        this.postprocessNote(note, level);
      } else {
        this.container.removeChild(note);
      }
    }
  }

  async setNotes(hrefs) {
    // We remove unnecessary notes, ensure this.notes.length <= hrefs.length
    this.unstackNotes(hrefs.length);

    let note;
    for (const i = 0; i < this.notes.length; i++) {
      if (this.notes[i] == hrefs[i]) {
        continue;
      } else {
        note = await this.fetchNote(hrefs[i], i);
        this.container.children[i].replaceWith(note);
        this.notes[i] = hrefs[i];
      }
    }

    for (const i = this.notes.length; i < hrefs.length; i++) {
      note = await this.fetchNote(hrefs[i], i);
      this.container.appendChild(note);
      this.notes.push(hrefs[i]);
    }

    commitNotes(note);
  }

  async stackNote(href, level) {
    let index = this.notes.indexOf(href);
    if (index > -1) {
      this.container.children[index].scrollIntoView({behavior: "smooth", inline: "center"});
      return;
    }

    level = Number(level) || this.notes.length;
    this.unstackNotes(level);
    
    // FIXME: handling of URLs with #-parts
    const note = await this.fetchNote(href, level);
    this.container.appendChild(note);
    this.notes.push(href);
    this.commitNotes(note);
  }

  async stackNotes(hrefs, level) {
    level = Number(level) || this.notes.length;
    this.unstackNotes(level);

    let note;
    for (const href of hrefs) {
      note = await this.fetchNote(href, level);
      this.container.appendChild(note);
      this.notes.push(href);
    }

    this.commitNotes(note);
  }

  async fetchNote(href, level) {
    const response = await fetch(new Request(href));
    const rawHtml = await response.text();

    let fragment = document.createElement("template");
    fragment.innerHTML = rawHtml;

    let note = fragment.content.querySelector('.note');
    note.dataset.level = level + 1;
    this.postprocessNote(note, level + 1);
    return note;
  }
  
  unstackNotes(level) {
    for (let i = this.container.children.length - 1; i >= level; i--) {
      this.container.removeChild(this.container.children[i]);
    }
    this.notes = this.notes.slice(0, level);
  }
  
  commitNotes(focus_target) {
    setTimeout(
      () => {
        if (focus_target) {
          focus_target.scrollIntoView({behavior: "smooth", inline: "center"});
        }
        if (window.MathJax) {
          window.MathJax.typeset();
        }
      },
      10
    );
  }

  pushToHistory() {
    let url = new URL(window.location);
    url.searchParams.set("stacked-notes", JSON.stringify(this.notes.slice(1)))

    let state = { notes : this.notes };
    window.history.pushState(state, "", url.toString());
  }

  postprocessNote(note, level) {
    level = Number(level) || this.notes.length;

    setTimeout(() => refreshAsides(note), 5);

    let links = [...note.querySelectorAll('a')];
    links.forEach(a => {
      if (isRelativeUrl(a.getAttribute('href'))) {
        a.dataset.level = level;
        a.addEventListener("click", event => {
          if (!event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            this.stackNote(a.href, a.dataset.level);
            this.pushToHistory();
          }
        })
      } else {
        a.classList.add("external-link");
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }
}

function isRelativeUrl(url) {
  try {
    return new URL(document.baseURI).origin == new URL(url, document.baseURI).origin;
  } catch {
    return false;
  }
}

function refreshAsides(note) {
  let prev_aside;
  for (const aside of note.querySelectorAll("aside")) {
    let name = aside.getAttribute('name');
    if (!name) {
      window.console.log("No name for aside:", aside);
      aside.classList.remove("floating-aside");
      continue;
    }

    let target = note.querySelector(`span[name="${name}"]`);
    if (!target) {
      window.console.log("No target for aside:", aside);
      aside.classList.remove("floating-aside");
      continue;
    }

    // FIXME: avoid overlapping with previous aside
    aside.classList.add("floating-aside");
    aside.style = `top: ${target.offsetTop}px`;

    if (prev_aside) {
      const prev_bounds = prev_aside.getBoundingClientRect();
      const bounds = aside.getBoundingClientRect();
      if (bounds.top < prev_bounds.bottom) {
        aside.style = `top: ${prev_aside.offsetTop + prev_aside.offsetHeight}px`;
      }
    }

    prev_aside = aside;
  }
}

window.addEventListener('load', event => {
  const container = document.getElementById("notes-container");
  const controller = new StackedNotesController(container);
  
  const params = new URLSearchParams(window.location.search);
  let notes = params.get('stacked-notes');
  try {
    notes = JSON.parse(notes);
  } catch (SyntaxError) {
    notes = null;
  }

  if (Array.isArray(notes) && notes.length > 0) {
    controller.stackNotes(notes, 1);
  }

  window.addEventListener('popstate', event => {
    controller.setNotes(event.state.notes);
  });

})