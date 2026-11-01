workspace {
    model {
        a = softwareSystem "A"
    }
    views {
        systemContext a "Context" {
            include *
            autoLayout tb 300 160
        }
    }
}
