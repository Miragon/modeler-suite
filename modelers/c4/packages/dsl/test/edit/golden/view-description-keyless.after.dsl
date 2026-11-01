workspace {
    model {
        a = softwareSystem "A"
    }
    views {
        systemContext a {
            include *
            autoLayout tb 300 160
            title "A in context"
            description "Who uses A."
        }
    }
}
