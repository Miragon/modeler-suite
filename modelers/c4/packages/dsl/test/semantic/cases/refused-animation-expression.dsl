workspace {
    model {
        a = softwareSystem "A"
        b = softwareSystem "B"
        c = softwareSystem "C"
        a -> b
    }
    views {
        systemLandscape "Landscape" {
            include *
            animation {
                a->
                b
            }
        }
    }
}
