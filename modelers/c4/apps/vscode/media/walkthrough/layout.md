# Your layout lives in your file

When you move an element on the canvas, the C4 Modeler writes the positions into the `properties`
block of that view, in the same file as the model:

```
systemContext bookshop "BookshopContext" {
    include *
    autoLayout tb 300 160
    properties {
        "c4modeler.element.bookshop" "400,40"
        "c4modeler.element.customer" "40,40"
    }
}
```

The first change in a view writes a line for each of its elements; after that, a moved element
changes one line of your diff. There is no second layout file to lose. A view without these lines
is laid out automatically.

Structurizr reads the file as before: it ignores these properties and keeps laying out views with
`autoLayout` itself. **Lay out automatically** in the menu removes the lines of the current view, so
it is laid out automatically again.
