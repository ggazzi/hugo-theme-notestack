class StackedNote {
  constructor(href, element) {
    this.href = href;
    this.element = element;
    this.title = element.querySelector('h1').textContent;
  }
}

class StackedNotesController {

  constructor(notes_container, placeholder_template) {
    this.container = notes_container;
    this.placeholder = placeholder_template.content.firstElementChild;
    this.notes = [];

    for (const note of notes_container.children) {
      if ([...note.classList].includes('note') && 'href' in note.dataset) {
        this.notes.push(new StackedNote(note.dataset.href, note));

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
    for (let i = 0; i < this.notes.length; i++) {
      if (this.notes[i].href == hrefs[i]) {
        continue;
      } else {
        this.container.children[i].replaceWith(this.placeholder);
        const placeholder_focus = setTimeout(() => this.placeholder.scrollIntoView({behavior: "smooth", inline: "center"}), 10);
        note = await this.fetchNote(hrefs[i], i);
        clearTimeout(placeholder_focus);

        this.placeholder.replaceWith(note);
        this.notes[i] = new StackedNote(hrefs[i], note);
      }
    }

    this.container.appendChild(this.placeholder);

    for (let i = this.notes.length; i < hrefs.length; i++) {
      const placeholder_focus = setTimeout(() => this.placeholder.scrollIntoView({behavior: "smooth", inline: "center"}), 10);
      note = await this.fetchNote(hrefs[i], i);
      clearTimeout(placeholder_focus);

      this.placeholder.before(note);
      this.notes.push(new StackedNote(hrefs[i], note));
    }

    this.container.removeChild(this.placeholder);
    this.commitNotes(note);
  }

  async stackNote(href, level) {
    let existing_note = this.notes.find(note => note.href == href);
    if (existing_note) {
      existing_note.element.scrollIntoView({behavior: "smooth", inline: "center"});
      return;
    }

    level = Number(level) || this.notes.length;
    this.unstackNotes(level);

    this.container.appendChild(this.placeholder);

    // FIXME: handling of URLs with #-parts
    const placeholder_focus = setTimeout(() => this.placeholder.scrollIntoView({behavior: "smooth", inline: "center"}), 10);
    const note = await this.fetchNote(href, level);
    clearTimeout(placeholder_focus);

    this.placeholder.replaceWith(note);
    this.notes.push(new StackedNote(href, note));
    this.commitNotes(note);
  }

  async stackNotes(hrefs, level) {
    level = Number(level) || this.notes.length;
    this.unstackNotes(level);

    this.container.appendChild(this.placeholder);

    let note;
    for (const href of hrefs) {
      const placeholder_focus = setTimeout(() => this.placeholder.scrollIntoView({behavior: "smooth", inline: "center"}), 10);
      note = await this.fetchNote(href, level);
      clearTimeout(placeholder_focus);

      this.placeholder.before(note);
      this.notes.push(new StackedNote(href, note));
    }

    this.container.removeChild(this.placeholder);
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
    for (let i = this.notes.length - 1; i >= level; i--) {
      const note = this.notes.pop();
      note.element.remove();
    }
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
    url.searchParams.set("stacked-notes", JSON.stringify(this.notes.slice(1).map(note => note.href)))

    let state = { notes : this.notes.map(note => note.href) };
    window.history.pushState(state, "", url.toString());
  }

  postprocessNote(note, level) {
    level = Number(level) || this.notes.length;

    setTimeout(() => refreshAsides(note), 5);

    let links = [...note.querySelectorAll('a')];
    links.forEach(a => {
      const url = asRelativeUrl(a.getAttribute('href'));
      if (url) {
        a.dataset.level = level;
        a.addEventListener("click", event => {
          if (!event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            this.stackNote(url, a.dataset.level)
              .then(() => this.pushToHistory());
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

function asRelativeUrl(url) {
  try {
    let resolved = new URL(url, document.baseURI);
    if (resolved.origin === new URL(document.baseURI).origin) {
      return resolved.pathname;
    } else {
      return null;
    }
  } catch {
    return null;
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
  const placeholder_template = document.getElementById("template-note-placeholder");
  const controller = new StackedNotesController(container, placeholder_template);

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