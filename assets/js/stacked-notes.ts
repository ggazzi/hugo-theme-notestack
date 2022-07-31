class StackedNote {
  readonly href : string;
  readonly title: string;
  readonly element: HTMLElement;
  readonly sidebar_item: HTMLElement;

  constructor(href: string, element: HTMLElement, sidebar_item: HTMLElement) {
    this.href = href;
    this.title = element.querySelector('h1').textContent;
    this.element = element;
    this.sidebar_item = sidebar_item;
  }
}

type StackedNotesControllerParams = {
  title_base: string;
  notes_container: HTMLElement;
  note_placeholder: HTMLElement;
  sidebar_list: HTMLElement;
  sidebar_item_template: HTMLElement;
}

const SCROLL_BEHAVIOUR: ScrollIntoViewOptions = 
  {behavior: "smooth", inline: "center"};

class StackedNotesController {
  private readonly title_base: string;
  private readonly container : HTMLElement;
  private readonly note_placeholder : HTMLElement;
  private readonly sidebar_list : HTMLElement;
  private readonly sidebar_item_template : HTMLElement;
  private readonly notes: StackedNote[];

  constructor(params: StackedNotesControllerParams) {
    this.title_base = params.title_base;
    this.container = params.notes_container;
    this.note_placeholder = params.note_placeholder;
    this.sidebar_list = params.sidebar_list;
    this.sidebar_item_template = params.sidebar_item_template;
    this.notes = [];

    for (const note_elem of this.container.children) {
      if (note_elem instanceof HTMLElement && [...note_elem.classList].includes('note') && 'href' in note_elem.dataset) {
        const note = this.buildNote(note_elem.dataset.href, note_elem, this.notes.length);
        this.notes.push(note);
        this.sidebar_list.appendChild(note.sidebar_item);
      } else {
        this.container.removeChild(note_elem);
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
        this.container.children[i].replaceWith(this.note_placeholder);
        this.notes[i] = note = await this.fetchAndPlaceNote(hrefs[i], i);
      }
    }

    this.container.appendChild(this.note_placeholder);

    for (let i = this.notes.length; i < hrefs.length; i++) {
      note = await this.fetchAndPlaceNote(hrefs[i], i);
    }

    this.note_placeholder.remove();
    this.commitNotes(note);
  }

  async stackNote(href: string, level: number) {
    let existing_note = this.notes.find(note => note.href === href);
    if (existing_note) {
      existing_note.element.scrollIntoView(SCROLL_BEHAVIOUR);
      return;
    }

    level = Number(level) || this.notes.length;
    this.unstackNotes(level);

    this.container.appendChild(this.note_placeholder);

    // FIXME: handling of URLs with #-parts
    const note = await this.fetchAndPlaceNote(href, level);

    this.note_placeholder.remove();
    this.commitNotes(note.element);
  }

  async stackNotes(hrefs: string[], level: number) {
    level = Number(level) || this.notes.length;
    this.unstackNotes(level);

    this.container.appendChild(this.note_placeholder);

    let note: StackedNote;
    for (const href of hrefs) {
      note = await this.fetchAndPlaceNote(href, level);
    }

    this.note_placeholder.remove();
    this.commitNotes(note.element);
  }

  // Pre: placeholder is in the location of the note
  // Post: placeholder is next sibling of note
  // Post: note pushed to this.notes
  // Post: note added to sidebar
  async fetchAndPlaceNote(href: string, level: number) : Promise<StackedNote> {
    const placeholder_focus = setTimeout(() => this.note_placeholder.scrollIntoView(SCROLL_BEHAVIOUR), 10);
    this.note_placeholder.querySelector('#info-loading').classList.remove('d-none');
    this.note_placeholder.querySelector('#error-loading').classList.add('d-none');

    let note: StackedNote;
    try {
      const response = await fetch(new Request(href));
      const rawHtml = await response.text();

      let fragment = document.createElement("template");
      fragment.innerHTML = rawHtml;
  
      note = this.buildNote(href, fragment.content.querySelector('.note'), level);
    } catch {
      this.note_placeholder.querySelector('#info-loading').classList.add('d-none');
      this.note_placeholder.querySelector('#error-loading').classList.remove('d-none');
      return
    }

    clearTimeout(placeholder_focus);

    this.notes.push(note);
    this.note_placeholder.before(note.element);
    this.sidebar_list.appendChild(note.sidebar_item);

    return note
  }

  buildNote(href: string, note_elem: HTMLElement, level: number) : StackedNote {
    this.postprocessNoteElem(note_elem, ++level);
    note_elem.dataset.href = href;
    note_elem.dataset.level = level.toString();

    const sidebar_elem = this.sidebar_item_template.cloneNode(true) as HTMLElement;
    const note = new StackedNote(href, note_elem, sidebar_elem)

    const link = sidebar_elem.querySelector('.sidebar-item-link') || sidebar_elem;
    link.textContent = note_elem.querySelector('h1').textContent;
    link.addEventListener('click', event => {
      event.preventDefault();
      note.element.scrollIntoView(SCROLL_BEHAVIOUR)
    });

    return note;
  }

  unstackNotes(level: number) {
    for (let i = this.notes.length - 1; i >= level; i--) {
      const note = this.notes.pop();
      note.element.remove();
      this.sidebar_list.children[i].remove();
    }
  }

  commitNotes(focus_target: HTMLElement | undefined) {
    document.title = this.title_base + this.notes.map(note => note.title).join(' » ');

    setTimeout(
      () => {
        if (focus_target) {
          focus_target.scrollIntoView(SCROLL_BEHAVIOUR);
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

  postprocessNoteElem(note: HTMLElement, level: number) {
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
      continue;
    }

    let target = note.querySelector(`span[name="${name}"]`);
    if (!target) {
      window.console.log("No target for aside:", aside);
      continue;
    }

    // FIXME: avoid overlapping with previous aside
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
    note_placeholder: (document.getElementById("template-note-placeholder") as HTMLTemplateElement).content.children[0] as HTMLElement,
    sidebar_list: document.getElementById("sidebar-pagelist") as HTMLElement,
    sidebar_item_template: (document.getElementById("template-sidebar-pagelist-item") as HTMLTemplateElement).content.children[0] as HTMLElement,
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
    if (event.state?.notes) {
      controller.setNotes(event.state.notes);
    }
  });

})