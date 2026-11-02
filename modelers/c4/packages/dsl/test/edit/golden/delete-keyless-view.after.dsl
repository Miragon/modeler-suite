workspace {
    model {
        a = softwareSystem "A"
        b = softwareSystem "B"
    }
    views {
        systemContext b "SystemContext-002" {
            include *
            autoLayout tb 300 160
        }
    }
}
