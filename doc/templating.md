Templating
==========

All templates are located in the [`views`](https://github.com/shownotes/show-pad/tree/master/views)-directory.
The templating engine used is [ejs](https://github.com/visionmedia/ejs)+[ejs-locals](https://github.com/RandomEtc/ejs-locals)+[node-i18n](https://github.com/mashpie/i18n-node) which makes a set of commands available:

* `layout('')`, specifies the parent-layout, see doctypes. Use `layout.ejs` when unsure.
* `script('')`
* `stylesheet('')`
* `__('')`, access to l18nzed strings
* `block('blockname', 'content')`, sets the content of some pice of layout defined somewhere elese, available blocks:
  * `title`, the content of the html-`<title>`

A very basic template could look like:

```
<% layout('layout.ejs') %>
<% block('title', "I'm the title!") -%>
<% script('/js/somescript.js') %>
<% stylesheet('/css/coolstyle.css') %>

<h1>Hello world! on <% __('header.home') %><h1>
```
