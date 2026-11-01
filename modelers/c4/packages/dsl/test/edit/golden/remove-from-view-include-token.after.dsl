workspace {
    model {
        a = softwareSystem "A"
        b = softwareSystem "B"
        c = softwareSystem "C"
    }
    views {
        systemLandscape "Landscape" {
            include a c
            autoLayout tb 300 160
        }
    }
}
