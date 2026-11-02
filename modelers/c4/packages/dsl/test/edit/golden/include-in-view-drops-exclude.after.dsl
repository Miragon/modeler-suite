workspace {
    model {
        a = softwareSystem "A"
        b = softwareSystem "B"
    }
    views {
        systemLandscape "Landscape" {
            include *
            autoLayout tb 300 160
        }
    }
}
