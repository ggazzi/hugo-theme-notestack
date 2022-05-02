class StackedNote {
  readonly href : string;
  readonly title: string;
  readonly element: HTMLElement;

  constructor(href: string, element: HTMLElement) {
    this.href = href;
    this.title = element.querySelector('h1').textContent;
    this.element = element;
  }
}

type StackedNotesControllerParams = {
  title_base: string;
  notes_container: HTMLElement;
  placeholder_template: HTMLTemplateElement;
}


class StackedNotesController {
  readonly title_base: string;
  private readonly container : Element;
  private readonly placeholder : Element;
  private readonly notes: StackedNote[];

  constructor(params: StackedNotesControllerParams) {
    this.title_base = params.title_base;
    this.container = params.notes_container;
    this.placeholder = params.placeholder_template.content.firstElementChild;
    this.notes = [];

    for (const note of this.container.children) {
      if (note instanceof HTMLElement && [...note.classList].includes('note') && 'href' in note.dataset) {
        this.notes.push(new StackedNote(note.dataset.href, note));

        let level = this.notes.length
        note.dataset.level = level.toString();
        this.postprocessNote(note, level);
      } else {
        this.container.removeChild(note);
      }
    }
  }

  async setNotes(hrefs: string[]) {
    // We remove unnecessary notes, ensure this.notes.length <= hrefs.length
    this.unstackNotes(hrefs.length);

    let note;
    for (let i = 0; i < this.notes.length; i++) {
      if (this.notes[i].href === hrefs[i]) {
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

  async stackNote(href: string, level: number) {
    let existing_note = this.notes.find(note => note.href === href);
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

  async stackNotes(hrefs: string[], level: number) {
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

  async fetchNote(href: string, level: number) : Promise<HTMLElement> {
    const response = await fetch(new Request(href));
    const rawHtml = await response.text();

    let fragment = document.createElement("template");
    fragment.innerHTML = rawHtml;

    let note = fragment.content.querySelector('.note') as HTMLElement;
    this.postprocessNote(note, ++level);
    note.dataset.level = level.toString();
    return note;
  }

  unstackNotes(level: number) {
    for (let i = this.notes.length - 1; i >= level; i--) {
      const note = this.notes.pop();
      note.element.remove();
    }
  }

  commitNotes(focus_target: HTMLElement) {
    document.title = this.title_base + this.notes.map(note => note.title).join(' » ');
    setTimeout(
      () => {
        if (focus_target) {
          focus_target.scrollIntoView({behavior: "smooth", inline: "center"});
        }
        //@ts-ignore
        if (window.MathJax) {
          //@ts-ignore
          window.MathJax.typeset();
        }
      },
      10
    );
  }

  pushToHistory() {
    let url = new URL(window.location.toString());
    url.searchParams.set("stacked-notes", JSON.stringify(this.notes.slice(1).map(note => note.href)))

    let state = { notes : this.notes.map(note => note.href) };
    window.history.pushState(state, "", url.toString());
  }

  postprocessNote(note: HTMLElement, level: number) {
    level = Number(level) || this.notes.length;

    setTimeout(() => refreshAsides(note), 5);

    let links = [...note.querySelectorAll('a')] as HTMLElement[];
    links.forEach(a => {
      const url = asRelativeUrl(a.getAttribute('href'));
      if (url) {
        a.dataset.level = level.toString();
        a.addEventListener("click", event => {
          if (!event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            this.stackNote(url, parseInt(a.dataset.level))
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
  const controller = new StackedNotesController({
    title_base: document.title.split(" · ")[0] + " · ",
    notes_container: document.getElementById("notes-container") as HTMLElement,
    placeholder_template: document.getElementById("template-note-placeholder") as HTMLTemplateElement,
  });

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