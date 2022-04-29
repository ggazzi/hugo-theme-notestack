# Hugo Notestack Theme

A Hugo theme for densely interconected notes.

Heavily inspired by the [cortex theme](https://github.com/jethrokuan/cortex) and the online version of the book [Crafting Interpreters](https://craftinginterpreters.com).


## Features

### Sidebar

A sidebar is displayed on every page containing the title of the site, links to the main sections and a search bar at the bottom.
In order for it to work, add something like the following to your Hugo project configuration:

```toml
title = 'Some Website'

[params]
mainSections = ['posts']
```

### Search

A search function is provided, looking for keywords in all regular pages.
In order for it to work, make sure to include the following in your Hugo project configuration:

```toml
[outputs]
home = ["HTML", "Lunr"]

[outputFormats.Lunr]
baseName = "index"
isPlainText = true
mediaType = "application/json"
notAlternative = true
```
